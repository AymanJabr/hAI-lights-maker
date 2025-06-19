import { useState } from 'react';
import { TranscriptionResult, VideoSegment, HighlightConfig } from '@/types';

// Define a custom error class to include status
export class ApiError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        // Set the prototype explicitly to allow instanceof checks
        Object.setPrototypeOf(this, ApiError.prototype);
    }
}

interface UseOpenAIProps {
    apiKey?: string;
}

export function useOpenAI({ apiKey }: UseOpenAIProps = {}) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Function to split audio into chunks
    async function splitAudioIntoChunks(audioBlob: Blob, maxChunkSizeBytes: number = 15 * 1024 * 1024): Promise<Blob[]> {
        console.log(`Splitting audio file (${audioBlob.size} bytes) into chunks of max ${maxChunkSizeBytes} bytes`);

        // If file is already small enough, return it as is
        if (audioBlob.size <= maxChunkSizeBytes) {
            console.log('Audio file is already small enough, no splitting needed');
            return [audioBlob];
        }

        try {
            // Dynamically import dependencies only when needed for performance.
            const { loadFFmpeg } = await import('@/lib/utils/video-utils');
            const { fetchFile } = await import('@ffmpeg/util');

            // Use the managed FFmpeg instance for audio splitting
            const ffmpeg = await loadFFmpeg();
            console.log('Managed FFmpeg instance loaded for audio splitting');

            // Write input file to FFmpeg filesystem
            const inputFileName = 'input.mp3';
            await ffmpeg.writeFile(inputFileName, await fetchFile(audioBlob));
            console.log('Input file written to FFmpeg filesystem');

            // Calculate the number of chunks needed based on file size
            const numChunks = Math.ceil(audioBlob.size / maxChunkSizeBytes);
            console.log(`Splitting into ${numChunks} chunks`);

            // Use the segment_time option with the stream copy feature to split the file
            // This avoids the need to calculate exact durations
            await ffmpeg.exec([
                '-i', inputFileName,
                '-f', 'segment',         // Use the segment muxer
                '-segment_time', '300',  // Each segment approximately 5 minutes
                '-c', 'copy',            // Stream copy (no re-encoding)
                '-reset_timestamps', '1', // Reset timestamps
                '-map', '0',             // Map all streams
                'chunk-%03d.mp3'         // Output pattern
            ]);

            // List all created chunk files
            const files = await ffmpeg.listDir('./');
            const chunkFiles = files
                .filter(file => file.name.startsWith('chunk-') && file.name.endsWith('.mp3'))
                .sort((a, b) => a.name.localeCompare(b.name));

            console.log(`Created ${chunkFiles.length} chunk files`);

            // Read each chunk and convert to Blob
            const chunks: Blob[] = [];
            for (const file of chunkFiles) {
                const fileData = await ffmpeg.readFile(file.name);
                // Only create blob if data is available and is a Uint8Array
                if (fileData && fileData instanceof Uint8Array) {
                    const chunkBlob = new Blob([fileData], { type: 'audio/mpeg' });
                    console.log(`Chunk ${file.name}: ${chunkBlob.size} bytes`);
                    chunks.push(chunkBlob);

                    // Clean up the chunk file
                    await ffmpeg.deleteFile(file.name);
                }
            }

            // Clean up and release FFmpeg
            await ffmpeg.deleteFile(inputFileName);
            console.log('FFmpeg filesystem cleaned for audio splitting');

            return chunks;
        } catch (error) {
            console.error('Error splitting audio:', error);
            throw new Error(`Failed to split audio file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async function transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
        setIsLoading(true);
        setError(null);

        try {
            if (!apiKey) {
                throw new Error('API key is required');
            }

            console.log(`Preparing to transcribe audio file (${audioBlob.size} bytes)`);

            // If the file is larger than 15MB, split it into chunks
            const MAX_CHUNK_SIZE = 15 * 1024 * 1024; // 15MB

            if (audioBlob.size > MAX_CHUNK_SIZE) {
                console.log(`File size (${audioBlob.size} bytes) exceeds ${MAX_CHUNK_SIZE} bytes, splitting into chunks`);

                // Split the audio into chunks
                const audioChunks = await splitAudioIntoChunks(audioBlob, MAX_CHUNK_SIZE);
                console.log(`Split audio into ${audioChunks.length} chunks`);

                // Process each chunk and collect transcription results
                let combinedTranscription = '';

                // Using unknown[] as OpenAI's API segment structure varies between versions
                // We'll add proper type casting when returning the final result
                const segmentTimestamps: unknown[] = [];

                for (let i = 0; i < audioChunks.length; i++) {
                    console.log(`Transcribing chunk ${i + 1}/${audioChunks.length} (${audioChunks[i].size} bytes)`);

                    // Transcribe this chunk
                    const chunkResult = await transcribeSingleChunk(audioChunks[i]);

                    // Calculate approximate chunk duration based on the transcription result
                    let chunkDuration = 0;
                    if (chunkResult.segments && chunkResult.segments.length > 0) {
                        // Find the maximum end time in the segment
                        chunkDuration = Math.max(...chunkResult.segments.map(s => s.end));
                        console.log(`Estimated chunk ${i + 1} duration from segments: ${chunkDuration.toFixed(2)}s`);
                    }

                    // Calculate a time offset for this chunk based on previous chunks
                    const chunkOffset: number = i === 0 ? 0 :
                        segmentTimestamps.length > 0 ?
                            // Use the end time of the last segment as the starting point
                            // Type assertion since we know these objects have 'end' property
                            Math.max(...(segmentTimestamps as { end: number }[]).map(s => s.end)) :
                            // Fallback: use an approximation (15 seconds per chunk)
                            i * 15;

                    console.log(`Using chunk ${i + 1} offset: ${chunkOffset.toFixed(2)}s`);

                    // Append text
                    combinedTranscription += (i > 0 ? ' ' : '') + chunkResult.text;

                    // Adjust timestamps from this chunk to account for offset
                    if (chunkResult.segments && Array.isArray(chunkResult.segments)) {
                        const adjustedSegments = chunkResult.segments.map(segment => {
                            // Apply offset and add a small gap between chunks (0.1s)
                            const adjustedStart: number = segment.start + chunkOffset + (i > 0 ? 0.1 : 0);
                            const adjustedEnd: number = segment.end + chunkOffset + (i > 0 ? 0.1 : 0);

                            return {
                                ...segment,
                                start: adjustedStart,
                                end: adjustedEnd,
                            };
                        });
                        segmentTimestamps.push(...adjustedSegments);
                    }

                    console.log(`Chunk ${i + 1} transcription complete`);
                }

                // Return the combined results with type assertion for segments
                return {
                    text: combinedTranscription,
                    segments: segmentTimestamps as TranscriptionResult['segments']
                };
            } else {
                // If the file is small enough, transcribe it directly
                console.log('File is small enough for direct transcription');
                return await transcribeSingleChunk(audioBlob);
            }
        } catch (err) {
            let errorMessage: string;

            if (err instanceof ApiError) {
                errorMessage = err.message;
            } else if (err instanceof Error) {
                errorMessage = err.message;
            } else {
                errorMessage = 'Unknown error during transcription';
            }

            console.error('Transcription error details:', err);
            // Potentially enrich the global error state if needed, or rely on the component using the hook
            setError(errorMessage); // setError will store the message string
            // Re-throw the original error (or the ApiError) so the calling component can also react, e.g. to status
            throw err;
        } finally {
            setIsLoading(false);
        }
    }

    // Helper function to transcribe a single chunk
    async function transcribeSingleChunk(audioBlob: Blob): Promise<TranscriptionResult> {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.mp3');
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'json');
        formData.append('timestamp_granularities[]', 'segment');

        console.log(`Sending transcription request to API for ${audioBlob.size} bytes`);
        const response = await fetch('/api/openai/transcribe', {
            method: 'POST',
            body: formData,
            headers: {
                'X-API-KEY': apiKey || '',
            },
        });

        if (!response.ok) {
            let errorText = '';
            let isFileSizeError = false;
            const responseStatus = response.status; // Store status before trying to parse body
            try {
                const errorJson = await response.json();
                if (responseStatus === 413 && errorJson.error) {
                    errorText = errorJson.error;
                    isFileSizeError = true;
                } else {
                    errorText = JSON.stringify(errorJson);
                }
            } catch (e) {
                errorText = await response.text(); // Fallback if .json() fails
                errorText = errorText + " " + e;
            }
            console.error(`Transcription API error (${responseStatus}):`, errorText);

            const finalErrorMessage = isFileSizeError
                ? errorText
                : `Transcription failed: ${responseStatus} ${response.statusText}. ${errorText}`;

            throw new ApiError(finalErrorMessage, responseStatus);
        }

        console.log('Transcription API response received');
        const result = await response.json();

        // Validate the response
        if (!result.text) {
            console.error('Invalid transcription result:', result);
            throw new Error('Invalid transcription result: missing text');
        }

        return result;
    }

    async function findHighlights(
        transcript: string,
        config: HighlightConfig,
        videoDuration: number
    ): Promise<VideoSegment[]> {
        setIsLoading(true);
        setError(null);

        try {
            if (!apiKey) {
                throw new Error('API key is required');
            }

            const promptMode = config.mode === 'custom'
                ? config.customPrompt
                : getPromptForMode(config.mode);

            const response = await fetch('/api/openai/highlights', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': apiKey || '',
                },
                body: JSON.stringify({
                    transcript,
                    prompt: promptMode,
                    videoDuration
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to generate highlights: ${response.statusText}. ${errorText}`);
            }

            const highlightSegments = await response.json();
            return highlightSegments;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error finding highlights';
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }

    function getPromptForMode(mode: HighlightConfig['mode']): string {
        switch (mode) {
            case 'highlights':
                return 'Find the most important and engaging moments in this video that capture key information or action.';
            case 'epic':
                return 'Find the most dramatic, exciting, and impactful moments that would create an epic highlight reel.';
            case 'main-ideas':
                return 'Identify the main ideas, key concepts, and central points discussed in this video.';
            case 'funny':
                return 'Find the most humorous, entertaining, and light-hearted moments in this video.';
            default:
                return 'Find the most important and engaging moments in this video.';
        }
    }

    return {
        transcribeAudio,
        findHighlights,
        isLoading,
        error,
    };
} 