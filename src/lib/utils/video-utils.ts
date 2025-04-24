import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoMetadata, VideoSegment } from '@/types';

let ffmpeg: FFmpeg | null = null;

export async function loadFFmpeg() {
    if (ffmpeg) return ffmpeg;

    ffmpeg = new FFmpeg();

    // Load ffmpeg core
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
    const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
    await ffmpeg.load({ coreURL, wasmURL });

    return ffmpeg;
}

export async function getVideoMetadata(file: File): Promise<VideoMetadata> {
    const ffmpeg = await loadFFmpeg();
    const fileURL = URL.createObjectURL(file);

    // Create a video element to get basic metadata
    const video = document.createElement('video');
    video.src = fileURL;

    return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
            const duration = video.duration;
            const width = video.videoWidth;
            const height = video.videoHeight;

            // Cleanup
            URL.revokeObjectURL(fileURL);

            resolve({
                duration,
                width,
                height,
                fps: 30, // Assuming default fps, would need ffprobe for accurate fps
            });
        };

        video.onerror = () => {
            URL.revokeObjectURL(fileURL);
            reject(new Error("Failed to load video metadata"));
        };
    });
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
    targetDimensions?: { width: number; height: number }
): Promise<Blob> {
    const ffmpeg = await loadFFmpeg();
    const inputFileName = 'input.' + file.name.split('.').pop();
    const outputFileName = `output.${outputFormat}`;

    // Write the input file to the virtual filesystem
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));

    // Create a file list with segments for the concat filter
    let concatContent = '';
    let index = 0;

    for (const segment of segments) {
        const segmentFile = `segment-${index}.${outputFormat}`;

        // Extract each segment
        await ffmpeg.exec([
            '-i', inputFileName,
            '-ss', segment.start.toString(),
            '-to', segment.end.toString(),
            '-c', 'copy',
            segmentFile
        ]);

        concatContent += `file ${segmentFile}\n`;
        index++;
    }

    // Write the concat file
    await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatContent));

    // Concat all segments
    let command = [
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy'
    ];

    // Apply resize if target dimensions are provided
    if (targetDimensions) {
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
    await ffmpeg.exec(command);

    // Read the output file
    const data = await ffmpeg.readFile(outputFileName);
    const mimeType = outputFormat === 'mp4' ? 'video/mp4' : 'video/webm';
    return new Blob([data!], { type: mimeType });
}

// Function to create platform-specific output formats
export async function createPlatformSpecificVideos(
    file: File,
    segments: VideoSegment[]
): Promise<Record<string, Blob>> {
    const outputs: Record<string, Blob> = {};

    // YouTube format (16:9)
    outputs.youtube = await createHighlightVideo(file, segments, 'mp4', { width: 1920, height: 1080 });

    // TikTok/Instagram Stories format (9:16)
    outputs.tiktok = await createHighlightVideo(file, segments, 'mp4', { width: 1080, height: 1920 });

    // Instagram format (1:1)
    outputs.instagram = await createHighlightVideo(file, segments, 'mp4', { width: 1080, height: 1080 });

    return outputs;
} 