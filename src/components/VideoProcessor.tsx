import { v4 as uuidv4 } from 'uuid';
import { useOpenAI } from '@/hooks/useOpenAI';
import { ProcessedVideo, HighlightConfig, VideoMetadata, ProgressState, TranscriptionResult } from '@/types';

interface VideoProcessorProps {
    apiKey: string;
    videoFile: File | null;
    videoMetadata: VideoMetadata | null;
    highlightConfig: HighlightConfig;
    onProgress: (progress: ProgressState) => void;
    onProcessingComplete: (processedVideo: ProcessedVideo, transcript: string, transcriptionResult?: TranscriptionResult) => void;
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

            // We need to extract audio first to reduce file size
            let audioBlob;
            try {
                console.log('Extracting audio from video using FFmpeg');

                // Import FFmpeg dynamically and load our managed instance
                const { loadFFmpeg } = await import('@/lib/utils/video-utils');
                const { fetchFile } = await import('@ffmpeg/util');

                // Use the managed FFmpeg instance from our utility function
                const ffmpeg = await loadFFmpeg();
                console.log('Managed FFmpeg instance loaded for audio extraction');

                // Write the video file to FFmpeg filesystem
                await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
                console.log('Input file written to FFmpeg filesystem');

                // Extract audio to MP3 format
                await ffmpeg.exec([
                    '-i', 'input.mp4',
                    '-vn',                // No video
                    '-acodec', 'libmp3lame', // MP3 codec
                    '-q:a', '4',          // Quality setting (lower = better quality)
                    '-ar', '44100',       // Audio sampling rate
                    'output.mp3'
                ]);

                // Read the audio file
                const audioData = await ffmpeg.readFile('output.mp3');
                if (audioData && audioData instanceof Uint8Array) {
                    audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
                    console.log(`Extracted audio file: ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB`);
                } else {
                    throw new Error('Failed to extract audio: output data is empty or invalid');
                }

                // Clean up files but don't terminate the managed instance here.
                // The video-utils manager will handle termination.
                await ffmpeg.deleteFile('input.mp4');
                await ffmpeg.deleteFile('output.mp3');
                console.log('FFmpeg filesystem cleaned for audio extraction');
            } catch (error) {
                console.error('Error extracting audio:', error);
                throw new Error(`Failed to extract audio: ${error instanceof Error ? error.message : String(error)}`);
            }

            // For now, we'll just use the video file directly
            console.log('Step 2: Starting transcription');
            console.log(`Sending audio file to transcription API: ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB`);
            updateProgress('transcribing', 20, 'Transcribing audio...');

            const transcriptionStart = performance.now();
            let transcriptionResult;
            try {
                // Step 2.1: Upload the audio blob to Vercel Blob storage
                console.log("Uploading audio blob to storage...");
                updateProgress('transcribing', 25, 'Uploading audio for transcription...');
                const uploadResponse = await fetch(`/api/upload?filename=${videoId}-audio.mp3`, {
                    method: 'POST',
                    body: audioBlob,
                });

                if (!uploadResponse.ok) {
                    throw new Error('Failed to upload audio file.');
                }

                const { url: audioUrl } = await uploadResponse.json();
                console.log(`Audio uploaded successfully: ${audioUrl}`);
                updateProgress('transcribing', 30, 'Audio uploaded. Starting transcription...');

                transcriptionResult = await transcribeAudio(audioUrl);
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
            onProcessingComplete(processedVideo, transcriptionResult.text, transcriptionResult);

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

            console.log('--- Starting direct segment combination (without re-encoding) ---');
            console.log(`Combining ${processedVideo.segments.length} segments`);
            console.log(`Target platform: ${processedVideo.highlightConfig?.targetPlatform || 'original'}`);

            // First, collect all segment blobs from the video elements
            const videoElements = document.querySelectorAll('video[id^="segment-preview-"]');

            if (videoElements.length === 0) {
                throw new Error('No segment videos found. Please ensure all segments are processed first.');
            }

            const segmentBlobs: Blob[] = [];

            for (let i = 0; i < videoElements.length; i++) {
                onProgress({
                    status: 'processing',
                    progress: 10 + ((i + 1) / videoElements.length * 30),
                    message: `Collecting segment ${i + 1}/${videoElements.length}...`
                });

                const video = videoElements[i] as HTMLVideoElement;
                if (video && video.src) {
                    try {
                        const response = await fetch(video.src);
                        const blob = await response.blob();
                        segmentBlobs.push(blob);
                        console.log(`Collected segment ${i + 1} blob: ${blob.size} bytes`);
                    } catch (error) {
                        console.error(`Error collecting segment ${i + 1}:`, error);
                        throw new Error(`Failed to collect segment ${i + 1}`);
                    }
                }
            }

            if (segmentBlobs.length === 0) {
                throw new Error('Could not find any processed segment videos.');
            }

            onProgress({
                status: 'processing',
                progress: 40,
                message: `Found ${segmentBlobs.length} processed segments to combine`
            });

            // Import the concatenateSegmentBlobs function
            const { concatenateSegmentBlobs } = await import('@/lib/utils/video-utils');

            // Fast concatenation without re-encoding
            onProgress({
                status: 'processing',
                progress: 50,
                message: 'Fast combining segments without re-encoding...'
            });

            const combinedBlob = await concatenateSegmentBlobs(
                segmentBlobs,
                'mp4',
                (step, progress, detail) => {
                    onProgress({
                        status: 'processing',
                        progress: 50 + (progress * 40), // 50-90% range
                        message: detail || `Combining (${step})`
                    });
                }
            );

            console.log(`Combined video created: ${combinedBlob.size} bytes`);

            // Create URL for the combined video
            const combinedUrl = URL.createObjectURL(combinedBlob);
            console.log(`Created URL for combined video: ${combinedUrl}`);

            // Store for recovery
            if (typeof window !== 'undefined') {
                window._lastCreatedVideoBlob = combinedBlob;
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

    const createFormatSpecificVideos = async (processedVideo: ProcessedVideo) => {
        if (!videoFile || !processedVideo?.segments || !videoMetadata) {
            console.error('Missing required data for creating format-specific videos');
            return null;
        }

        try {
            onProgress({
                status: 'processing',
                progress: 10,
                message: 'Checking for existing processed segments...'
            });

            // Check if we have already processed segments
            const videoElements = document.querySelectorAll('video[id^="segment-preview-"]');

            if (videoElements.length > 0 && videoElements.length === processedVideo.segments.length) {
                console.log('Found existing processed segments, using them for faster processing');

                // Import the video utils
                const { concatenateSegmentBlobs } = await import('@/lib/utils/video-utils');

                // Collect segment blobs
                const segmentBlobs: Blob[] = [];

                for (let i = 0; i < videoElements.length; i++) {
                    onProgress({
                        status: 'processing',
                        progress: 10 + ((i + 1) / videoElements.length * 20),
                        message: `Collecting segment ${i + 1}/${videoElements.length}...`
                    });

                    const video = videoElements[i] as HTMLVideoElement;
                    if (video && video.src) {
                        try {
                            const response = await fetch(video.src);
                            const blob = await response.blob();
                            segmentBlobs.push(blob);
                            console.log(`Collected segment ${i + 1} blob: ${blob.size} bytes`);
                        } catch (error) {
                            console.error(`Error collecting segment ${i + 1}:`, error);
                            throw new Error(`Failed to collect segment ${i + 1}`);
                        }
                    }
                }

                if (segmentBlobs.length === processedVideo.segments.length) {
                    console.log(`All ${segmentBlobs.length} segments collected, combining directly`);

                    // Apply target platform to all segments for consistency
                    processedVideo.segments = processedVideo.segments.map(segment => ({
                        ...segment,
                        targetPlatform: processedVideo.highlightConfig?.targetPlatform
                    }));

                    // Fast concatenation without re-encoding
                    onProgress({
                        status: 'processing',
                        progress: 40,
                        message: 'Fast combining segments without re-encoding...'
                    });

                    const combinedBlob = await concatenateSegmentBlobs(
                        segmentBlobs,
                        'mp4',
                        (step, progress, detail) => {
                            onProgress({
                                status: 'processing',
                                progress: 40 + (progress * 0.5),
                                message: detail || `Combining (${step})`
                            });
                        }
                    );

                    console.log(`Combined video created: ${combinedBlob.size} bytes`);

                    onProgress({
                        status: 'completed',
                        progress: 100,
                        message: 'Fast video creation complete!'
                    });

                    return { [processedVideo.highlightConfig.targetPlatform]: combinedBlob };
                }
            }

            // If we get here, we need to use the original approach
            console.log('Using standard approach to create videos (slower)');
            onProgress({
                status: 'processing',
                progress: 30,
                message: 'Preparing to create videos in target format...'
            });

            // Import the video utils dynamically
            const { createPlatformSpecificVideos } = await import('@/lib/utils/video-utils');

            // Apply the target platform to segments if not already set
            const segmentsWithPlatform = processedVideo.segments.map(segment => ({
                ...segment,
                targetPlatform: processedVideo.highlightConfig?.targetPlatform || 'original'
            }));

            // Create the progress callback
            const progressCallback = (step: string, progress: number, detail?: string) => {
                onProgress({
                    status: 'processing',
                    progress: 30 + (progress * 0.7),
                    message: detail || `Creating videos (${step})`
                });
            };

            // Call the platform-specific video creation function
            const outputs = await createPlatformSpecificVideos(
                videoFile,
                segmentsWithPlatform,
                videoMetadata,
                progressCallback
            );

            onProgress({
                status: 'completed',
                progress: 100,
                message: 'Format-specific videos created successfully'
            });

            return outputs;
        } catch (error) {
            console.error('Error creating format-specific videos:', error);
            onProgress({
                status: 'error',
                progress: 0,
                message: `Failed to create videos: ${error instanceof Error ? error.message : String(error)}`
            });
            throw error;
        }
    };

    return {
        processVideo,
        combineSegments,
        createFormatSpecificVideos,
        isLoading,
        openAIError
    };
} 