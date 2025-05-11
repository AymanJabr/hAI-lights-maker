import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { VideoMetadata, VideoSegment } from '@/types';

// Define a global type extension for the window object
declare global {
    interface Window {
        _lastCreatedVideoBlob?: Blob;
    }
}

// Improved FFmpeg management with proper cleanup
let ffmpeg: FFmpeg | null = null;
let isLoading = false;
let loadingPromise: Promise<FFmpeg> | null = null;
let usageCount = 0;
let lastOperationTime = Date.now();

// Force reload FFmpeg if it gets stuck
const forceReloadThreshold = 2; // Reduced from 3 to 2 to be more aggressive about resource cleanup
const maxIdleTime = 30000; // 30 seconds (reduced from 60)
let lastUsageTime = Date.now();

export async function loadFFmpeg(): Promise<FFmpeg> {
    const currentTime = Date.now();

    // Reset FFmpeg if it hasn't been used for a while or usage count is high
    if (ffmpeg && (
        (currentTime - lastUsageTime > maxIdleTime) ||
        (usageCount >= forceReloadThreshold) ||
        (currentTime - lastOperationTime > 10000) // Force reload if no operation in 10 seconds
    )) {
        console.log(`Forcing FFmpeg reload: idle time=${(currentTime - lastUsageTime) / 1000}s, usage count=${usageCount}, op idle=${(currentTime - lastOperationTime) / 1000}s`);
        await releaseFFmpeg();
    }

    // If FFmpeg is already loaded, return it immediately
    if (ffmpeg) {
        console.log('Using existing FFmpeg instance');
        usageCount++;
        lastUsageTime = currentTime;
        return ffmpeg;
    }

    // If loading is in progress, wait for it to complete instead of starting a new load
    if (isLoading && loadingPromise) {
        console.log('FFmpeg loading already in progress, waiting...');
        return loadingPromise;
    }

    // Start loading process
    console.log('Creating new FFmpeg instance');
    isLoading = true;
    usageCount = 0;

    loadingPromise = (async () => {
        try {
            const instance = new FFmpeg();
            console.log('Loading FFmpeg core...');

            // Use dynamically imported files from node_modules
            await instance.load();

            console.log('FFmpeg loaded successfully');
            ffmpeg = instance;
            lastUsageTime = currentTime;
            lastOperationTime = Date.now();
            usageCount = 1;
            return instance;
        } catch (error) {
            console.error('Failed to load FFmpeg:', error);
            // Reset state on error
            ffmpeg = null;
            throw new Error(`FFmpeg loading failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            isLoading = false;
            loadingPromise = null;
        }
    })();

    return loadingPromise;
}

// Properly release FFmpeg resources
export async function releaseFFmpeg(): Promise<void> {
    if (!ffmpeg) return;

    try {
        console.log('Releasing FFmpeg instance');

        try {
            // Try to terminate the FFmpeg worker
            await ffmpeg.terminate();
        } catch (error) {
            console.warn('Error terminating FFmpeg worker:', error);
        }

        // Reset state regardless of success
        ffmpeg = null;
        usageCount = 0;
        console.log('FFmpeg instance released');
    } catch (error) {
        console.error('Error releasing FFmpeg:', error);
        // Force reset state even if error occurs
        ffmpeg = null;
        usageCount = 0;
    }
}

export async function getVideoMetadata(file: File): Promise<VideoMetadata> {
    console.log(`Extracting metadata from file: ${file.name} (${file.size} bytes)`);

    // For video metadata, we don't need FFmpeg - just use the browser's built-in video element
    try {
        // Create a video element to get basic metadata
        const video = document.createElement('video');
        const fileURL = URL.createObjectURL(file);
        console.log(`Created blob URL for metadata extraction: ${fileURL}`);

        video.src = fileURL;
        video.muted = true; // Mute to prevent audio playback

        return new Promise((resolve, reject) => {
            // Set a timeout to abort if loading takes too long
            const timeout = setTimeout(() => {
                URL.revokeObjectURL(fileURL);
                cleanup();
                reject(new Error("Timeout: Failed to load video metadata after 15 seconds"));
            }, 15000);

            // Clean up function to remove event listeners
            const cleanup = () => {
                video.removeEventListener('loadedmetadata', onMetadataLoaded);
                video.removeEventListener('error', onError);
                clearTimeout(timeout);
            };

            const onMetadataLoaded = () => {
                const duration = video.duration;
                const width = video.videoWidth;
                const height = video.videoHeight;

                console.log(`Video metadata loaded - Duration: ${duration}s, Resolution: ${width}x${height}`);

                // Cleanup
                URL.revokeObjectURL(fileURL);
                cleanup();

                resolve({
                    duration,
                    width,
                    height,
                    fps: 30, // Assuming default fps
                });
            };

            const onError = () => {
                const errorMessage = video.error ?
                    `Video error: ${video.error.code} - ${video.error.message || 'Unknown error'}` :
                    'Unknown video loading error';

                console.error(errorMessage);
                URL.revokeObjectURL(fileURL);
                cleanup();
                reject(new Error(`Failed to load video: ${errorMessage}`));
            };

            // Add event listeners
            video.addEventListener('loadedmetadata', onMetadataLoaded);
            video.addEventListener('error', onError);

            // Attempt to load the video
            video.load();
        });
    } catch (err) {
        console.error('Error in getVideoMetadata:', err);
        throw new Error(`Failed to process video metadata: ${err instanceof Error ? err.message : String(err)}`);
    }
}

export async function extractFrames(
    file: File,
    targetFps: number = 1,
    outputFormat: 'jpeg' | 'png' = 'jpeg'
): Promise<Blob[]> {
    const ffmpegInstance = await loadFFmpeg();
    const inputFileName = 'input.' + file.name.split('.').pop();

    try {
        // Write the file to FFmpeg's virtual file system
        await ffmpegInstance.writeFile(inputFileName, await fetchFile(file));

        // Extract frames at the specified frame rate
        const outputPattern = 'frame-%03d.' + outputFormat;
        await ffmpegInstance.exec([
            '-i', inputFileName,
            '-vf', `fps=${targetFps}`,
            '-q:v', '1',
            outputPattern
        ]);

        // Get list of frame files
        const frameFiles = await ffmpegInstance.listDir('./');
        const frameFilenames = frameFiles
            .filter(file => file.name.startsWith('frame-') && file.name.endsWith(`.${outputFormat}`))
            .map(file => file.name)
            .sort();

        // Read each frame file
        const frames: Blob[] = [];
        for (const filename of frameFilenames) {
            const data = await ffmpegInstance.readFile(filename);
            if (data) {
                const blob = new Blob([data], { type: `image/${outputFormat}` });
                frames.push(blob);
            }
        }

        // Clean up files to prevent memory leaks
        for (const filename of frameFilenames) {
            await ffmpegInstance.deleteFile(filename);
        }
        await ffmpegInstance.deleteFile(inputFileName);

        return frames;
    } catch (error) {
        console.error('Error extracting frames:', error);
        throw error;
    } finally {
        // If usage count is high, release resources
        if (usageCount >= forceReloadThreshold) {
            await releaseFFmpeg();
        }
    }
}

export async function createHighlightVideo(
    file: File,
    segments: VideoSegment[],
    outputFormat: 'mp4' | 'webm' = 'mp4',
    targetDimensions?: { width: number; height: number },
    onProgress?: (step: string, progress: number, detail?: string) => void
): Promise<Blob> {
    const maxAttempts = 2;
    let lastError: any = null;

    // Record operation start time for tracking
    lastOperationTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            onProgress?.('init', 0, attempt > 1 ? `Reinitializing FFmpeg (Attempt ${attempt}/${maxAttempts})` : 'Initializing FFmpeg');

            // Fresh FFmpeg instance for each major operation
            if (attempt > 1 || usageCount >= forceReloadThreshold) {
                console.log("Releasing FFmpeg before new highlight video creation");
                await releaseFFmpeg();
            }

            // Make sure FFmpeg is properly loaded
            let ffmpegInstance: FFmpeg;
            try {
                ffmpegInstance = await loadFFmpeg();
                console.log(`FFmpeg loaded successfully for video processing (Attempt ${attempt}/${maxAttempts})`);
            } catch (ffmpegError) {
                console.error('Failed to load FFmpeg for video processing:', ffmpegError);

                // Force reload on error
                await releaseFFmpeg();

                throw new Error(`Could not initialize video processor: ${ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError)}`);
            }

            // Track that we're in an active operation
            lastOperationTime = Date.now();

            // Try executing a simple command to verify the FFmpeg instance is valid
            try {
                await ffmpegInstance.exec(['-version']);
                console.log('FFmpeg instance verified');
            } catch (verifyError) {
                console.error('FFmpeg instance verification failed:', verifyError);
                // Force reload of FFmpeg for next attempt
                await releaseFFmpeg();
                throw new Error('FFmpeg instance invalid, forcing reload');
            }

            const fileExt = file.name.split('.').pop() || 'mp4';
            const inputFileName = `input.${fileExt}`;
            const outputFileName = `output.${outputFormat}`;
            const finalOutputFileName = `final-output.${outputFormat}`;

            // Write the input file to the virtual filesystem
            onProgress?.('writing_input', 10, 'Loading video file');
            console.log(`Loading file into FFmpeg: ${file.name} (${file.size} bytes)`);

            try {
                // Extract file content directly without using fetchFile
                const arrayBuffer = await file.arrayBuffer();
                const fileData = new Uint8Array(arrayBuffer);

                // Write to FFmpeg's virtual filesystem
                await ffmpegInstance.writeFile(inputFileName, fileData);
                console.log(`Successfully loaded file into FFmpeg, size: ${fileData.byteLength} bytes`);
                onProgress?.('writing_input', 20, 'Video file loaded');

                // Update operation timestamp
                lastOperationTime = Date.now();
            } catch (fileError) {
                console.error('Error loading file into FFmpeg:', fileError);
                // Force reload of FFmpeg for next attempt
                await releaseFFmpeg();
                throw new Error(`Failed to load video file: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
            }

            // List files to verify the input file was written
            const files = await ffmpegInstance.listDir('./');
            console.log('Files in FFmpeg filesystem:', files.map(f => f.name));

            // Create a file list with segments for the concat filter
            let concatContent = '';
            let index = 0;
            const totalSegments = segments.length;

            onProgress?.('extracting_segments', 20, `Extracting ${totalSegments} segments`);

            // For a single segment case, handle it differently to avoid concat issues
            if (segments.length === 1) {
                const segment = segments[0];
                // Update operation timestamp
                lastOperationTime = Date.now();

                onProgress?.('extracting_segments', 40,
                    `Extracting segment (${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s)`);

                try {
                    // Extract the single segment directly to the output file with re-encoding for accuracy
                    let extractCommand = [
                        '-ss', segment.start.toString(),
                        '-i', inputFileName,
                        '-t', (segment.end - segment.start).toString()
                    ];

                    // Apply resize if target dimensions are provided
                    if (targetDimensions) {
                        console.log(`Applying target dimensions: ${targetDimensions.width}x${targetDimensions.height} with center crop`);
                        extractCommand = extractCommand.concat([
                            '-vf', `scale=${targetDimensions.width}:${targetDimensions.height}:force_original_aspect_ratio=increase,crop=${targetDimensions.width}:${targetDimensions.height}`,
                            '-c:v', 'libx264',
                            '-crf', '23',
                            '-preset', 'medium',
                            '-c:a', 'aac'
                        ]);
                    } else {
                        console.log('No target dimensions specified, using original dimensions');
                        // Use re-encoding even without resizing for accurate cuts
                        extractCommand = extractCommand.concat([
                            '-c:v', 'libx264',
                            '-crf', '23',
                            '-preset', 'medium',
                            '-c:a', 'aac'
                        ]);
                    }

                    extractCommand.push(outputFileName);
                    console.log('Running FFmpeg command for single segment:', extractCommand.join(' '));

                    await ffmpegInstance.exec(extractCommand);
                    console.log(`Extracted single segment: ${segment.start}s - ${segment.end}s directly to output`);

                    onProgress?.('finalizing', 90, 'Creating final video file');

                    // Read the output file directly
                    const data = await ffmpegInstance.readFile(outputFileName);
                    if (!data) {
                        throw new Error('Failed to read output file, data is null');
                    }

                    const mimeType = outputFormat === 'mp4' ? 'video/mp4' : 'video/webm';
                    const outputBlob = new Blob([data], { type: mimeType });
                    console.log(`Successfully created output file, size: ${outputBlob.size} bytes`);

                    // Store the blob in a global variable for recovery if needed
                    if (typeof window !== 'undefined') {
                        window._lastCreatedVideoBlob = outputBlob;
                        console.log('Saved video blob to window._lastCreatedVideoBlob for recovery');
                    }

                    // Clean up files
                    try {
                        await ffmpegInstance.deleteFile(inputFileName);
                        await ffmpegInstance.deleteFile(outputFileName);
                        console.log('Cleaned up FFmpeg files for single segment');
                    } catch (cleanupError) {
                        console.warn('Non-fatal error during cleanup:', cleanupError);
                    }

                    // Release FFmpeg
                    await releaseFFmpeg();

                    onProgress?.('finalizing', 100, 'Video processing complete');
                    return outputBlob;
                } catch (segmentError) {
                    console.error(`Error processing single segment:`, segmentError);
                    await releaseFFmpeg();
                    throw new Error(`Failed to process segment: ${segmentError instanceof Error ? segmentError.message : String(segmentError)}`);
                }
            }

            // Multiple segments case - extract each segment first
            for (const segment of segments) {
                // Update operation timestamp for each segment
                lastOperationTime = Date.now();

                const segmentFile = `segment-${index}.${outputFormat}`;

                // Calculate segment progress (20-60% of total)
                const segmentProgress = 20 + Math.floor((index / totalSegments) * 40);
                onProgress?.('extracting_segments', segmentProgress,
                    `Extracting segment ${index + 1}/${totalSegments} (${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s)`);

                try {
                    // Extract each segment with re-encoding for accurate frame boundaries
                    await ffmpegInstance.exec([
                        '-ss', segment.start.toString(),
                        '-i', inputFileName,
                        '-t', (segment.end - segment.start).toString(),
                        '-c:v', 'libx264', // Re-encode video
                        '-preset', 'medium', // Balance between speed and quality
                        '-crf', '23', // Good quality (lower is better)
                        '-c:a', 'aac', // Re-encode audio
                        segmentFile
                    ]);
                    console.log(`Extracted segment ${index + 1}: ${segment.start}s - ${segment.end}s`);
                } catch (segmentError) {
                    console.error(`Error extracting segment ${index + 1}:`, segmentError);
                    throw new Error(`Failed to extract segment ${index + 1}: ${segmentError instanceof Error ? segmentError.message : String(segmentError)}`);
                }

                concatContent += `file ${segmentFile}\n`;
                index++;
            }

            // Update operation timestamp
            lastOperationTime = Date.now();

            // Write the concat file
            onProgress?.('concatenating', 60, 'Preparing to join segments');
            await ffmpegInstance.writeFile('concat.txt', new TextEncoder().encode(concatContent));
            console.log('Created concat file with content:', concatContent);

            // Concat all segments
            let command = [
                '-f', 'concat',
                '-safe', '0',
                '-i', 'concat.txt'
            ];

            // Apply resize if target dimensions are provided
            if (targetDimensions) {
                onProgress?.('concatenating', 65, `Resizing to ${targetDimensions.width}x${targetDimensions.height}`);
                console.log(`Applying target dimensions to concat output: ${targetDimensions.width}x${targetDimensions.height} with center crop`);
                command = command.concat([
                    '-vf', `scale=${targetDimensions.width}:${targetDimensions.height}:force_original_aspect_ratio=increase,crop=${targetDimensions.width}:${targetDimensions.height}`,
                    '-c:v', 'libx264',
                    '-crf', '23',
                    '-preset', 'medium',
                    '-c:a', 'aac'
                ]);
            } else {
                console.log('No target dimensions for concat, using original dimensions');
                // Re-encode with good quality settings to ensure consistency between segments
                command = command.concat([
                    '-c:v', 'libx264',
                    '-crf', '23',
                    '-preset', 'medium',
                    '-c:a', 'aac'
                ]);
            }

            command.push(finalOutputFileName);
            onProgress?.('concatenating', 70, 'Joining segments into final video');
            console.log('Running FFmpeg command:', command.join(' '));

            try {
                console.log('Starting final concatenation...');
                await ffmpegInstance.exec(command);
                console.log('Successfully joined segments into final video');

                // Update operation timestamp
                lastOperationTime = Date.now();
            } catch (concatError) {
                console.error('Error joining segments:', concatError);
                throw new Error(`Failed to join segments: ${concatError instanceof Error ? concatError.message : String(concatError)}`);
            }

            // Read the output file (using the final output filename)
            onProgress?.('finalizing', 90, 'Creating final video file');

            try {
                // Read the final concatenated file
                const data = await ffmpegInstance.readFile(finalOutputFileName);
                if (!data) {
                    throw new Error('Failed to read final output file, data is null');
                }

                const mimeType = outputFormat === 'mp4' ? 'video/mp4' : 'video/webm';
                const outputBlob = new Blob([data], { type: mimeType });
                console.log(`Successfully created final output file, size: ${outputBlob.size} bytes`);

                // Add enhanced logging to ensure file is ready
                console.log(`Video processing COMPLETE - Output blob created successfully`);
                console.log(`Mime type: ${mimeType}, Blob valid: ${outputBlob instanceof Blob}`);

                // Log to help diagnose UI update issues
                console.log(`About to return output blob from createHighlightVideo function`);

                // Store the blob in a global variable for recovery if needed
                if (typeof window !== 'undefined') {
                    window._lastCreatedVideoBlob = outputBlob;
                    console.log('Saved video blob to window._lastCreatedVideoBlob for recovery');
                }

                // Clean up files to prevent memory leaks and filesystem errors
                try {
                    // List and remove all files created during the process
                    const allFiles = await ffmpegInstance.listDir('./');
                    for (const file of allFiles) {
                        if (file.name !== '.' && file.name !== '..') {
                            await ffmpegInstance.deleteFile(file.name);
                        }
                    }
                    console.log('Cleaned up FFmpeg virtual filesystem');
                } catch (cleanupError) {
                    console.warn('Non-fatal error during filesystem cleanup:', cleanupError);
                    // Don't throw - we already have the output blob
                }

                // Always release FFmpeg when processing is complete
                console.log(`Releasing FFmpeg after video processing (usage: ${usageCount})`);
                await releaseFFmpeg();

                onProgress?.('finalizing', 100, 'Video processing complete');
                return outputBlob;
            } catch (outputError) {
                console.error('Error reading final output file:', outputError);
                // Force FFmpeg reload on error
                await releaseFFmpeg();
                throw new Error(`Failed to read final output file: ${outputError instanceof Error ? outputError.message : String(outputError)}`);
            }

        } catch (error) {
            console.error(`Error in createHighlightVideo (Attempt ${attempt}/${maxAttempts}):`, error);
            lastError = error;

            // Always release FFmpeg on error
            await releaseFFmpeg();

            // If not the last attempt, wait a bit before retrying
            if (attempt < maxAttempts) {
                console.log(`Retrying in 1 second... (Attempt ${attempt}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // If we reach here, all attempts failed
    console.error(`All ${maxAttempts} attempts failed in createHighlightVideo`);
    throw lastError || new Error('Failed to process video after multiple attempts');
}

// Function to calculate dimensions based on target aspect ratio without preserving the original aspect ratio
// This is used to adapt videos to different platform formats (YouTube, TikTok, Instagram)
// by stretching to fit the target aspect ratio
// - originalWidth/Height: The original video dimensions
// - targetAspectRatio: The desired aspect ratio (e.g., 16/9 for YouTube, 9/16 for TikTok, 1/1 for Instagram)
//                      or null to preserve original dimensions
export function calculateAdaptiveDimensions(
    originalWidth: number,
    originalHeight: number,
    targetAspectRatio: number | null
): { width: number, height: number } {
    // If targetAspectRatio is null, return original dimensions
    if (targetAspectRatio === null) {
        return { width: originalWidth, height: originalHeight };
    }

    // For specific standard formats, use exact dimensions
    // This ensures consistent output size regardless of input
    if (targetAspectRatio === 16 / 9) {
        // YouTube - standard 1080p
        return { width: 1920, height: 1080 };
    } else if (targetAspectRatio === 9 / 16) {
        // TikTok/Reels - standard vertical 1080p
        return { width: 1080, height: 1920 };
    } else if (Math.abs(targetAspectRatio - 1) < 0.01) {
        // Instagram - standard 1:1 square
        return { width: 1080, height: 1080 };
    }

    // For non-standard aspect ratios, calculate adaptive dimensions
    // that preserve the maximum quality
    const originalAspectRatio = originalWidth / originalHeight;

    // If targetAspectRatio is close to originalAspectRatio, return original dimensions
    const aspectRatioDifference = Math.abs(originalAspectRatio - targetAspectRatio);
    if (aspectRatioDifference < 0.01) { // Small threshold for floating point comparison
        return { width: originalWidth, height: originalHeight };
    }

    // Determine if we should preserve width or height based on which gives better quality
    if (originalAspectRatio > targetAspectRatio) {
        // Original is wider than target - fit by height to avoid losing height resolution
        const newHeight = originalHeight;
        const newWidth = Math.round(newHeight * targetAspectRatio);
        return { width: newWidth, height: newHeight };
    } else {
        // Original is taller than target - fit by width to avoid losing width resolution
        const newWidth = originalWidth;
        const newHeight = Math.round(newWidth / targetAspectRatio);
        return { width: newWidth, height: newHeight };
    }
}

/**
 * Get the aspect ratio for a specific platform
 * @param platform Target platform
 * @returns Aspect ratio as number, or null for original ratio
 */
function getAspectRatioForPlatform(platform: string): number | null {
    switch (platform) {
        case 'youtube':
            console.log('Processing YouTube format (16:9) - video will be stretched to fill');
            return 16 / 9;
        case 'tiktok':
            console.log('Processing TikTok/Reels format (9:16) - video will be stretched to fill');
            return 9 / 16;
        case 'instagram':
            console.log('Processing Instagram format (1:1) - video will be stretched to fill');
            return 1 / 1;
        case 'original':
        default:
            console.log('Processing with original dimensions (no stretching)');
            return null;
    }
}

// Function to create platform-specific output formats
export async function createPlatformSpecificVideos(
    file: File,
    segments: VideoSegment[],
    videoMetadata: VideoMetadata,
    onProgress?: (step: string, progress: number, detail?: string) => void
): Promise<Record<string, Blob>> {
    try {
        const outputs: Record<string, Blob> = {};
        let platforms: string[];

        // Determine which platforms to process based on the target platform in highlight config
        // This would be passed from the component that calls this function
        const targetPlatform = segments[0]?.targetPlatform || 'original';
        console.log(`Creating videos for platform: ${targetPlatform}`);
        console.log(`Original video dimensions: ${videoMetadata.width}x${videoMetadata.height}`);

        if (targetPlatform === 'original') {
            platforms = ['original'];
            console.log('Using original format only');
        } else {
            platforms = [targetPlatform];
            console.log(`Using specific platform format: ${targetPlatform}`);
        }

        const totalPlatforms = platforms.length;

        for (let i = 0; i < totalPlatforms; i++) {
            const platform = platforms[i];
            const aspectRatio = getAspectRatioForPlatform(platform);

            onProgress?.('platform_specific', (i / totalPlatforms) * 100,
                `Creating ${platform} format (${i + 1}/${totalPlatforms})`);

            // Calculate target dimensions based on platform
            const dimensions = calculateAdaptiveDimensions(
                videoMetadata.width,
                videoMetadata.height,
                aspectRatio
            );

            console.log(`Platform ${platform}: Using dimensions ${dimensions.width}x${dimensions.height}`);
            console.log(`Segments have targetPlatform set: ${segments.map(s => s.targetPlatform || 'none').join(', ')}`);

            // For each platform processing, we adapt the progress to be within the current platform's range
            const platformProgressCallback = (step: string, progress: number, detail?: string) => {
                // Scale progress to be within the correct range for overall progress
                // Each platform takes up (1/totalPlatforms) of the total progress space
                const scaledProgress = (i / totalPlatforms) * 100 + (progress / totalPlatforms);
                onProgress?.(step, scaledProgress, `[${platform}] ${detail}`);
            };

            try {
                console.log(`Starting to create ${platform} format video...`);
                console.log(`Target dimensions: ${dimensions.width}x${dimensions.height}`);
                outputs[platform] = await createHighlightVideo(
                    file,
                    segments,
                    'mp4',
                    dimensions,
                    platformProgressCallback
                );
                console.log(`Successfully created ${platform} format video, size: ${outputs[platform].size} bytes`);
            } catch (platformError) {
                console.error(`Error creating ${platform} format:`, platformError);
                // Continue with other platforms instead of failing completely
                onProgress?.('platform_specific', (i / totalPlatforms) * 100,
                    `⚠️ Failed to create ${platform} format: ${platformError instanceof Error ? platformError.message : String(platformError)}`);
            }
        }

        // Check if we were able to create at least one output
        if (Object.keys(outputs).length === 0) {
            throw new Error('Failed to create any platform-specific videos');
        }

        return outputs;
    } catch (error) {
        console.error('Error in createPlatformSpecificVideos:', error);
        throw error;
    }
}

// Add a new function specifically for concatenating segments without transcoding
export async function concatenateSegments(
    segments: VideoSegment[],
    outputFormat: 'mp4' | 'webm' = 'mp4',
    onProgress?: (step: string, progress: number, detail?: string) => void
): Promise<Blob> {
    console.log('Starting simple segment concatenation without transcoding');
    onProgress?.('concatenating', 0, 'Preparing to join segments');

    const maxAttempts = 2;
    let lastError: any = null;

    // Record operation start time for tracking
    lastOperationTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Always start with a fresh FFmpeg instance for concatenation
            if (ffmpeg) {
                console.log('Releasing any existing FFmpeg instance before concatenation');
                await releaseFFmpeg();
            }

            // Load a fresh FFmpeg instance
            const ffmpegInstance = await loadFFmpeg();
            console.log('FFmpeg loaded successfully for concatenation');

            // List available segment files
            onProgress?.('concatenating', 10, 'Checking for segment files');

            try {
                // Verify FFmpeg instance is working
                await ffmpegInstance.exec(['-version']);
                console.log('FFmpeg instance verified for concatenation');
            } catch (error) {
                console.error('FFmpeg instance verification failed:', error);
                await releaseFFmpeg();
                throw new Error('FFmpeg instance invalid for concatenation');
            }

            // Create concat file
            let concatContent = '';
            for (let i = 0; i < segments.length; i++) {
                // In concatenateSegments, we assume segment files are already created
                // and named in a predictable format
                const segmentFile = `segment-${i}.${outputFormat}`;
                concatContent += `file ${segmentFile}\n`;

                // Update progress
                const progress = 10 + Math.floor((i / segments.length) * 30);
                onProgress?.('concatenating', progress, `Preparing segment ${i + 1}/${segments.length}`);
            }

            console.log('Creating concat file with content:', concatContent);
            onProgress?.('concatenating', 40, 'Creating file list for concatenation');
            await ffmpegInstance.writeFile('concat.txt', new TextEncoder().encode(concatContent));

            // Simple concatenation command without transcoding
            const outputFileName = `combined-output.${outputFormat}`;
            const command = [
                '-f', 'concat',
                '-safe', '0',
                '-i', 'concat.txt',
                '-c', 'copy', // Just copy streams without transcoding
                outputFileName
            ];

            console.log('Running simple concatenation command:', command.join(' '));
            onProgress?.('concatenating', 50, 'Joining segments (without transcoding)');

            try {
                await ffmpegInstance.exec(command);
                console.log('Successfully joined segments without transcoding');
                onProgress?.('concatenating', 80, 'Join complete, preparing final file');
            } catch (concatError) {
                console.error('Error during simple concatenation:', concatError);
                throw new Error(`Failed to join segments: ${concatError instanceof Error ? concatError.message : String(concatError)}`);
            }

            // Read output file
            try {
                const data = await ffmpegInstance.readFile(outputFileName);
                if (!data) {
                    throw new Error('Failed to read concatenated output file');
                }

                const mimeType = outputFormat === 'mp4' ? 'video/mp4' : 'video/webm';
                const outputBlob = new Blob([data], { type: mimeType });
                console.log(`Successfully created concatenated file, size: ${outputBlob.size} bytes`);

                // Store for recovery
                if (typeof window !== 'undefined') {
                    window._lastCreatedVideoBlob = outputBlob;
                }

                // We'll skip cleanup to avoid issues, and just release the entire instance
                console.log('Releasing FFmpeg after concatenation');
                await releaseFFmpeg();

                onProgress?.('finalizing', 100, 'Concatenation complete');
                return outputBlob;
            } catch (outputError) {
                console.error('Error reading concatenated output:', outputError);
                await releaseFFmpeg();
                throw new Error(`Failed to read output: ${outputError instanceof Error ? outputError.message : String(outputError)}`);
            }
        } catch (error) {
            console.error(`Error in concatenateSegments (Attempt ${attempt}/${maxAttempts}):`, error);
            lastError = error;

            // Release FFmpeg and try again
            await releaseFFmpeg();

            if (attempt < maxAttempts) {
                console.log(`Retrying concatenation in 1 second... (Attempt ${attempt}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // If we reach here, all attempts failed
    console.error(`All ${maxAttempts} attempts failed in concatenateSegments`);
    throw lastError || new Error('Failed to concatenate segments after multiple attempts');
}

/**
 * Concatenates multiple segment blobs directly without re-encoding
 * @param segmentBlobs Array of Blob objects representing video segments
 * @param outputFormat Output format (defaults to mp4)
 * @param progressCallback Optional callback for progress updates
 * @returns A Blob representing the concatenated video
 */
export const concatenateSegmentBlobs = async (
    segmentBlobs: Blob[],
    outputFormat: string = 'mp4',
    progressCallback?: (step: string, progress: number, detail?: string) => void
): Promise<Blob> => {
    if (!segmentBlobs || segmentBlobs.length === 0) {
        throw new Error('No segment blobs provided for concatenation');
    }

    console.log(`Concatenating ${segmentBlobs.length} segment blobs directly (fast method)`);
    progressCallback?.('init', 0, 'Initializing FFmpeg for fast concatenation');

    // If there's only one segment, just return it
    if (segmentBlobs.length === 1) {
        console.log('Only one segment, returning directly');
        progressCallback?.('complete', 1, 'Single segment, no concatenation needed');
        return segmentBlobs[0];
    }

    try {
        // Get FFmpeg instance
        const ffmpeg = await loadFFmpeg();
        progressCallback?.('load', 0.1, 'FFmpeg loaded');

        // Write each segment to FFmpeg filesystem
        const segmentFiles: string[] = [];

        for (let i = 0; i < segmentBlobs.length; i++) {
            const segmentName = `segment_${i}.mp4`;
            await ffmpeg.writeFile(segmentName, new Uint8Array(await segmentBlobs[i].arrayBuffer()));
            segmentFiles.push(segmentName);
            progressCallback?.('writing', 0.1 + (i / segmentBlobs.length * 0.3), `Writing segment ${i + 1}/${segmentBlobs.length}`);
        }

        // Create concat.txt file for FFmpeg
        const concatContent = segmentFiles.map(file => `file ${file}`).join('\n');
        await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatContent));
        progressCallback?.('preparing', 0.4, 'Preparing concatenation');

        // Concatenate without re-encoding (much faster!)
        const outputFileName = `output.${outputFormat}`;
        console.log('Executing fast concatenation command...');
        progressCallback?.('concatenating', 0.5, 'Combining segments (no re-encoding)');

        // Using stream copy (-c copy) to avoid re-encoding
        await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c', 'copy',
            outputFileName
        ]);

        progressCallback?.('processing', 0.8, 'Reading concatenated video');

        // Read the output file
        const data = await ffmpeg.readFile(outputFileName);
        const blob = new Blob([data], { type: `video/${outputFormat}` });

        // Clean up
        for (const file of segmentFiles) {
            try {
                await ffmpeg.deleteFile(file);
            } catch (e) {
                console.warn(`Could not clean up file ${file}`, e);
            }
        }
        try {
            await ffmpeg.deleteFile('concat.txt');
            await ffmpeg.deleteFile(outputFileName);
        } catch (e) {
            console.warn('Could not clean up concat files', e);
        }

        // Release FFmpeg resources if we've completed our high-level operation
        if (usageCount >= forceReloadThreshold) {
            await releaseFFmpeg();
        }

        progressCallback?.('complete', 1, 'Concatenation complete');
        console.log(`Concatenated video created: ${blob.size} bytes`);
        return blob;
    } catch (error) {
        console.error('Error in fast concatenation:', error);
        progressCallback?.('error', 0, `Concatenation error: ${error instanceof Error ? error.message : String(error)}`);
        await releaseFFmpeg(); // Always release on error
        throw new Error(`Failed to concatenate segments: ${error instanceof Error ? error.message : String(error)}`);
    }
}; 