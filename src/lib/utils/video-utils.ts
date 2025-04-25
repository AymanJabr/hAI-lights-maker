import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { VideoMetadata, VideoSegment } from '@/types';
import { toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function loadFFmpeg() {
    if (ffmpeg) {
        console.log('Using existing FFmpeg instance');
        return ffmpeg;
    }

    console.log('Creating new FFmpeg instance');
    try {
        ffmpeg = new FFmpeg();

        console.log('Loading FFmpeg core...');

        // Use dynamically imported files from node_modules
        // This leverages Next.js's ability to handle these imports
        await ffmpeg.load();

        console.log('FFmpeg loaded successfully');
        return ffmpeg;
    } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        throw new Error(`FFmpeg loading failed: ${error instanceof Error ? error.message : String(error)}`);
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
    const ffmpeg = await loadFFmpeg();
    const inputFileName = 'input.' + file.name.split('.').pop();

    // Write the file to FFmpeg's virtual file system
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));

    // Extract frames at the specified frame rate
    const outputPattern = 'frame-%03d.' + outputFormat;
    await ffmpeg.exec([
        '-i', inputFileName,
        '-vf', `fps=${targetFps}`,
        '-q:v', '1',
        outputPattern
    ]);

    // Get list of frame files
    const frameFiles = await ffmpeg.listDir('./');
    const frameFilenames = frameFiles
        .filter(file => file.name.startsWith('frame-') && file.name.endsWith(`.${outputFormat}`))
        .map(file => file.name)
        .sort();

    // Read each frame file
    const frames: Blob[] = [];
    for (const filename of frameFilenames) {
        const data = await ffmpeg.readFile(filename);
        if (data) {
            const blob = new Blob([data], { type: `image/${outputFormat}` });
            frames.push(blob);
        }
    }

    return frames;
}

export async function createHighlightVideo(
    file: File,
    segments: VideoSegment[],
    outputFormat: 'mp4' | 'webm' = 'mp4',
    targetDimensions?: { width: number; height: number },
    onProgress?: (step: string, progress: number, detail?: string) => void
): Promise<Blob> {
    try {
        onProgress?.('init', 0, 'Initializing FFmpeg');

        // Make sure FFmpeg is properly loaded
        let ffmpegInstance: FFmpeg;
        try {
            ffmpegInstance = await loadFFmpeg();
            console.log('FFmpeg loaded successfully for video processing');
        } catch (ffmpegError) {
            console.error('Failed to load FFmpeg for video processing:', ffmpegError);
            throw new Error(`Could not initialize video processor: ${ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError)}`);
        }

        const fileExt = file.name.split('.').pop() || 'mp4';
        const inputFileName = `input.${fileExt}`;
        const outputFileName = `output.${outputFormat}`;

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
        } catch (fileError) {
            console.error('Error loading file into FFmpeg:', fileError);
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

        for (const segment of segments) {
            const segmentFile = `segment-${index}.${outputFormat}`;

            // Calculate segment progress (20-60% of total)
            const segmentProgress = 20 + Math.floor((index / totalSegments) * 40);
            onProgress?.('extracting_segments', segmentProgress,
                `Extracting segment ${index + 1}/${totalSegments} (${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s)`);

            try {
                // Extract each segment
                await ffmpegInstance.exec([
                    '-i', inputFileName,
                    '-ss', segment.start.toString(),
                    '-to', segment.end.toString(),
                    '-c', 'copy',
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

        // Write the concat file
        onProgress?.('concatenating', 60, 'Preparing to join segments');
        await ffmpegInstance.writeFile('concat.txt', new TextEncoder().encode(concatContent));
        console.log('Created concat file with content:', concatContent);

        // Concat all segments
        let command = [
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c', 'copy'
        ];

        // Apply resize if target dimensions are provided
        if (targetDimensions) {
            onProgress?.('concatenating', 65, `Resizing to ${targetDimensions.width}x${targetDimensions.height}`);
            command = [
                '-f', 'concat',
                '-safe', '0',
                '-i', 'concat.txt',
                '-vf', `scale=${targetDimensions.width}:${targetDimensions.height}`,
                '-c:v', 'libx264',
                '-crf', '23',
                '-preset', 'medium',
                '-c:a', 'aac'
            ];
        }

        command.push(outputFileName);
        onProgress?.('concatenating', 70, 'Joining segments into final video');
        console.log('Running FFmpeg command:', command.join(' '));

        try {
            await ffmpegInstance.exec(command);
            console.log('Successfully joined segments');
        } catch (concatError) {
            console.error('Error joining segments:', concatError);
            throw new Error(`Failed to join segments: ${concatError instanceof Error ? concatError.message : String(concatError)}`);
        }

        // Read the output file
        onProgress?.('finalizing', 90, 'Creating final video file');

        try {
            const data = await ffmpegInstance.readFile(outputFileName);
            if (!data) {
                throw new Error('Failed to read output file, data is null');
            }

            const mimeType = outputFormat === 'mp4' ? 'video/mp4' : 'video/webm';
            const outputBlob = new Blob([data], { type: mimeType });
            console.log(`Successfully created output file, size: ${outputBlob.size} bytes`);

            onProgress?.('finalizing', 100, 'Video processing complete');
            return outputBlob;
        } catch (outputError) {
            console.error('Error reading output file:', outputError);
            throw new Error(`Failed to read output file: ${outputError instanceof Error ? outputError.message : String(outputError)}`);
        }
    } catch (error) {
        console.error('Error in createHighlightVideo:', error);
        throw error;
    }
}

// Function to create platform-specific output formats
export async function createPlatformSpecificVideos(
    file: File,
    segments: VideoSegment[],
    onProgress?: (step: string, progress: number, detail?: string) => void
): Promise<Record<string, Blob>> {
    try {
        const outputs: Record<string, Blob> = {};
        const platforms = ['youtube', 'tiktok', 'instagram'];
        const totalPlatforms = platforms.length;

        for (let i = 0; i < totalPlatforms; i++) {
            const platform = platforms[i];
            onProgress?.('platform_specific', (i / totalPlatforms) * 100,
                `Creating ${platform} format (${i + 1}/${totalPlatforms})`);

            let dimensions;
            switch (platform) {
                case 'youtube':
                    dimensions = { width: 1920, height: 1080 }; // 16:9
                    break;
                case 'tiktok':
                    dimensions = { width: 1080, height: 1920 }; // 9:16
                    break;
                case 'instagram':
                    dimensions = { width: 1080, height: 1080 }; // 1:1
                    break;
            }

            // For each platform processing, we adapt the progress to be within the current platform's range
            const platformProgressCallback = (step: string, progress: number, detail?: string) => {
                // Scale progress to be within the correct range for overall progress
                // Each platform takes up (1/totalPlatforms) of the total progress space
                const scaledProgress = (i / totalPlatforms) * 100 + (progress / totalPlatforms);
                onProgress?.(step, scaledProgress, `[${platform}] ${detail}`);
            };

            try {
                console.log(`Starting to create ${platform} format video...`);
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