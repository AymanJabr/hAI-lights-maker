import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useOpenAI } from '@/hooks/useOpenAI';
import { ProcessedVideo, HighlightConfig, VideoMetadata, ProgressState } from '@/types';

interface VideoProcessorProps {
    apiKey: string;
    videoFile: File | null;
    videoMetadata: VideoMetadata | null;
    highlightConfig: HighlightConfig;
    onProgress: (progress: ProgressState) => void;
    onProcessingComplete: (processedVideo: ProcessedVideo, transcript: string) => void;
    onError: (error: string) => void;
}

export function useVideoProcessor({
    apiKey,
    videoFile,
    videoMetadata,
    highlightConfig,
    onProgress,
    onProcessingComplete,
    onError
}: VideoProcessorProps) {
    const [segmentBlobs, setSegmentBlobs] = useState<Blob[]>([]);
    const { transcribeAudio, findHighlights, isLoading, error: openAIError } = useOpenAI({ apiKey });

    const processVideo = async () => {
        if (!videoFile || !videoMetadata) return;

        // Create a custom function to update progress with logging
        const updateProgress = (status: ProgressState['status'], progress: number, message?: string) => {
            console.log(`Progress Update: ${status} - ${progress}% - ${message || ''}`);
            onProgress({ status, progress, message });
        };

        try {
            // Create a new processed video object
            const videoId = uuidv4();
            const initialProcessedVideo: ProcessedVideo = {
                id: videoId,
                originalFile: videoFile,
                segments: [],
                highlightConfig,
            };

            // Log start of process
            console.log('--- Starting video processing ---');
            console.log(`Video ID: ${videoId}`);
            console.log(`Video duration: ${videoMetadata.duration.toFixed(2)}s`);
            console.log(`Resolution: ${videoMetadata.width}x${videoMetadata.height}`);
            console.log(`Highlight mode: ${highlightConfig.mode}`);
            console.log(`Target platform: ${highlightConfig.targetPlatform}`);

            // Extract audio and transcribe
            updateProgress('transcribing', 0, 'Extracting audio...');
            console.log('Step 1: Extracting audio from video');

            // For now, we'll just use the video file directly
            console.log('Step 2: Starting transcription');
            console.log(`Sending file to transcription API: ${videoFile.name} (${(videoFile.size / (1024 * 1024)).toFixed(2)}MB)`);
            updateProgress('transcribing', 20, 'Transcribing audio...');

            const transcriptionStart = performance.now();
            let transcriptionResult;
            try {
                transcriptionResult = await transcribeAudio(videoFile);
                const transcriptionTime = ((performance.now() - transcriptionStart) / 1000).toFixed(2);

                console.log(`Transcription completed in ${transcriptionTime}s`);
                console.log(`Transcript length: ${transcriptionResult.text.length} characters`);
                console.log(`First 100 characters: "${transcriptionResult.text.substring(0, 100)}..."`);

                updateProgress('transcribing', 50, 'Transcription complete');
            } catch (transcriptionError) {
                console.error("Transcription failed:", transcriptionError);
                throw new Error(`Transcription failed: ${transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError)}`);
            }

            // Find highlights based on transcript
            console.log('Step 3: Analyzing transcript for highlights');
            updateProgress('analyzing', 60, 'Finding suggested segments...');

            const highlightsStart = performance.now();
            const segments = await findHighlights(
                transcriptionResult.text,
                highlightConfig,
                videoMetadata.duration
            );
            const highlightsTime = ((performance.now() - highlightsStart) / 1000).toFixed(2);

            console.log(`Highlight analysis completed in ${highlightsTime}s`);
            console.log(`Found ${segments.length} suggested segments`);
            segments.forEach((segment, i) => {
                console.log(`Segment ${i + 1}: ${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s (${(segment.end - segment.start).toFixed(2)}s) - ${segment.description || 'No description'}`);
            });

            // Create the processed video with suggested segments
            const processedVideo: ProcessedVideo = {
                ...initialProcessedVideo,
                segments,
                transcript: transcriptionResult.text,
            };

            // Mark process as completed after finding segments
            updateProgress('completed', 100, 'Suggested segments ready for review');
            console.log('--- Segment suggestion complete ---');

            // Notify parent component of completion with suggested segments
            onProcessingComplete(processedVideo, transcriptionResult.text);

        } catch (err) {
            console.error('Error during video processing:', err);
            updateProgress('error', 0, err instanceof Error ? err.message : 'Failed to process video');
            onError(err instanceof Error ? err.message : 'Failed to process video');
        }
    };

    const combineSegments = async (processedVideo: ProcessedVideo) => {
        if (!processedVideo?.segments || processedVideo.segments.length === 0) {
            console.error('No segments available for combining');
            return;
        }

        try {
            // Update progress
            onProgress({
                status: 'processing',
                progress: 10,
                message: 'Preparing to combine segments...'
            });

            console.log('--- Starting segment combination using FFmpeg ---');
            console.log(`Combining ${processedVideo.segments.length} segments`);

            // First, collect all segment URLs from the video elements
            const segmentUrls: string[] = [];
            const videoElements = document.querySelectorAll('video[id^="segment-preview-"]');

            if (videoElements.length === 0) {
                throw new Error('No segment videos found. Please ensure all segments are processed first.');
            }

            for (let i = 0; i < videoElements.length; i++) {
                const video = videoElements[i] as HTMLVideoElement;
                if (video && video.src) {
                    segmentUrls.push(video.src);
                    console.log(`Found segment URL ${i + 1}: ${video.src}`);
                }
            }

            if (segmentUrls.length === 0) {
                throw new Error('Could not find any processed segment videos.');
            }

            onProgress({
                status: 'processing',
                progress: 20,
                message: `Found ${segmentUrls.length} segments to combine`
            });

            // Import FFmpeg dynamically
            const { FFmpeg } = await import('@ffmpeg/ffmpeg');
            const { fetchFile } = await import('@ffmpeg/util');

            // Create a new FFmpeg instance for combining
            const ffmpeg = new FFmpeg();
            console.log('Loading FFmpeg for segment combination');

            onProgress({
                status: 'processing',
                progress: 30,
                message: 'Loading FFmpeg...'
            });

            await ffmpeg.load();
            console.log('FFmpeg loaded successfully');

            // Download each segment and add to FFmpeg
            for (let i = 0; i < segmentUrls.length; i++) {
                onProgress({
                    status: 'processing',
                    progress: 30 + ((i + 1) / segmentUrls.length * 40),
                    message: `Processing segment ${i + 1}/${segmentUrls.length}...`
                });

                try {
                    // Fetch the segment data
                    const response = await fetch(segmentUrls[i]);
                    const segmentData = await response.arrayBuffer();

                    const segmentFileName = `segment-${i}.mp4`;
                    console.log(`Writing segment ${i + 1} to FFmpeg (${segmentData.byteLength} bytes)`);

                    // Write segment to FFmpeg filesystem
                    await ffmpeg.writeFile(segmentFileName, new Uint8Array(segmentData));
                } catch (error) {
                    console.error(`Error processing segment ${i + 1}:`, error);
                    throw new Error(`Failed to process segment ${i + 1}`);
                }
            }

            // Create concat file content
            let concatContent = '';
            for (let i = 0; i < segmentUrls.length; i++) {
                concatContent += `file segment-${i}.mp4\n`;
            }

            console.log('Creating concat file with content:', concatContent);
            await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatContent));

            // Perform the concatenation
            onProgress({
                status: 'processing',
                progress: 75,
                message: 'Joining segments without transcoding...'
            });

            // Use copy codec to avoid transcoding
            console.log('Running FFmpeg concat command');
            await ffmpeg.exec([
                '-f', 'concat',
                '-safe', '0',
                '-i', 'concat.txt',
                '-c', 'copy',
                'output.mp4'
            ]);

            console.log('Successfully concatenated segments');

            // Read the output file
            onProgress({
                status: 'processing',
                progress: 90,
                message: 'Creating final video file...'
            });

            const outputData = await ffmpeg.readFile('output.mp4');
            if (!outputData) {
                throw new Error('Failed to read combined output file');
            }

            // Create output blob
            const combinedBlob = new Blob([outputData], { type: 'video/mp4' });
            console.log(`Created combined video, size: ${combinedBlob.size} bytes`);

            // Create URL
            const combinedUrl = URL.createObjectURL(combinedBlob);
            console.log(`Created URL for combined video: ${combinedUrl}`);

            // Store for recovery
            if (typeof window !== 'undefined') {
                window._lastCreatedVideoBlob = combinedBlob;
            }

            // Release FFmpeg resources
            try {
                await ffmpeg.terminate();
                console.log('Released FFmpeg resources');
            } catch (error) {
                console.warn('Error releasing FFmpeg resources:', error);
            }

            // Complete the process
            onProgress({
                status: 'completed',
                progress: 100,
                message: 'Combined video ready!'
            });

            // Return the URL for the combined video
            return { combined: combinedUrl };

        } catch (error) {
            console.error('Error combining segments:', error);
            onProgress({
                status: 'error',
                progress: 0,
                message: `Failed to combine segments: ${error instanceof Error ? error.message : String(error)}`
            });
            throw error;
        }
    };

    return {
        processVideo,
        combineSegments,
        isLoading,
        openAIError
    };
} 