'use client';

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import VideoUploader from '@/components/VideoUploader';
import HighlightConfig from '@/components/HighlightConfig';
import VideoPlayer from '@/components/VideoPlayer';
import ApiKeyConfig from '@/components/ApiKeyConfig';
import Header from '@/components/layout/Header';
import ProcessingLog from '@/components/ProcessingLog';
import SegmentsGallery from '@/components/SegmentsGallery';
import { useOpenAI } from '@/hooks/useOpenAI';
import { ApiKeyConfig as ApiKeyConfigType, HighlightConfig as HighlightConfigType, ProcessedVideo, ProgressState, VideoSegment, VideoMetadata } from '@/types';
import { getVideoMetadata, extractFrames, createHighlightVideo, createPlatformSpecificVideos } from '@/lib/utils/video-utils';

export default function Home() {
    const [apiConfig, setApiConfig] = useState<ApiKeyConfigType | null>(null);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState<string>('');
    const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
    const [highlightConfig, setHighlightConfig] = useState<HighlightConfigType>({
        mode: 'highlights',
        targetPlatform: 'youtube',
        maxDuration: 60,
    });
    const [progress, setProgress] = useState<ProgressState>({
        status: 'idle',
        progress: 0,
    });
    const [processedVideo, setProcessedVideo] = useState<ProcessedVideo | null>(null);
    const [highlightUrls, setHighlightUrls] = useState<Record<string, string>>({});
    const [transcript, setTranscript] = useState<string>('');

    const { transcribeAudio, findHighlights, isLoading, error } = useOpenAI({ apiKey: apiConfig?.apiKey });

    const handleApiConfigured = (config: ApiKeyConfigType) => {
        setApiConfig(config);
    };

    const handleVideoSelected = async (file: File) => {
        try {
            console.log('Video file selected:', file.name, 'Size:', (file.size / (1024 * 1024)).toFixed(2) + 'MB', 'Type:', file.type);

            // Create a custom function to update progress with logging
            const updateProgress = (status: ProgressState['status'], progress: number, message?: string) => {
                console.log(`Progress Update: ${status} - ${progress}% - ${message || ''}`);
                setProgress({ status, progress, message });
            };

            updateProgress('uploading', 0, 'Starting upload process...');
            setVideoFile(file);

            // Create object URL for the video
            const url = URL.createObjectURL(file);
            setVideoUrl(url);
            console.log('Video URL created for preview:', url);

            // Get video metadata
            try {
                updateProgress('uploading', 30, 'Analyzing video metadata...');
                console.log('Getting video metadata...');
                const metadata = await getVideoMetadata(file);
                console.log('Video metadata retrieved successfully:', metadata);
                setVideoMetadata(metadata);
                updateProgress('idle', 100, 'Video ready for processing');
            } catch (metadataError) {
                console.error('Error getting video metadata:', metadataError);

                // Attempt to get basic metadata through a fallback approach
                updateProgress('uploading', 40, 'Using fallback method for video analysis...');

                // Create a simple video element to try to get basic metadata
                const video = document.createElement('video');
                video.muted = true;

                // We'll create a new object URL to be safe
                URL.revokeObjectURL(url);
                const newUrl = URL.createObjectURL(file);
                video.src = newUrl;

                try {
                    await new Promise<void>((resolve, reject) => {
                        // Add timeout for the fallback
                        const timeout = setTimeout(() => {
                            reject(new Error('Timeout loading video metadata via fallback'));
                        }, 10000);

                        video.onloadedmetadata = () => {
                            clearTimeout(timeout);
                            const fallbackMetadata = {
                                duration: video.duration || 0,
                                width: video.videoWidth || 640,
                                height: video.videoHeight || 360,
                                fps: 30 // Assumed
                            };

                            console.log('Fallback metadata retrieved:', fallbackMetadata);
                            setVideoMetadata(fallbackMetadata);
                            URL.revokeObjectURL(newUrl);
                            resolve();
                        };

                        video.onerror = () => {
                            clearTimeout(timeout);
                            URL.revokeObjectURL(newUrl);
                            reject(new Error('Failed to load video metadata via fallback'));
                        };

                        // Try to load the video
                        video.load();
                    });

                    updateProgress('idle', 100, 'Video ready for processing (using fallback metadata)');
                } catch (fallbackError) {
                    console.error('Fallback metadata retrieval failed:', fallbackError);

                    // Use default metadata as last resort
                    const defaultMetadata = {
                        duration: 60, // Assume 1 minute
                        width: 640,
                        height: 360,
                        fps: 30
                    };

                    console.log('Using default metadata as fallback:', defaultMetadata);
                    setVideoMetadata(defaultMetadata);
                    updateProgress('idle', 100, 'Video ready for processing (using estimated metadata)');
                }
            }
        } catch (err) {
            console.error('Error during video upload:', err);
            setProgress({
                status: 'error',
                progress: 0,
                error: err instanceof Error ? err.message : 'Failed to load video'
            });
        }
    };

    const handleConfigChange = (config: HighlightConfigType) => {
        setHighlightConfig(config);
    };

    const processVideo = async () => {
        if (!videoFile || !videoMetadata) return;

        // Add a test log to check if console logging is working
        console.log("DEBUG: Starting processVideo function");

        // Create a custom function to update progress with logging
        const updateProgress = (status: ProgressState['status'], progress: number, message?: string) => {
            console.log(`Progress Update: ${status} - ${progress}% - ${message || ''}`);
            setProgress({ status, progress, message });
        };

        try {
            // Create a new processed video object
            const videoId = uuidv4();
            setProcessedVideo({
                id: videoId,
                originalFile: videoFile,
                segments: [],
                highlightConfig,
            });

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

            // TODO: In a production app, we would extract audio to a smaller file first
            // For now, we'll just use the video file directly
            console.log('Step 2: Starting transcription');
            console.log(`Sending file to transcription API: ${videoFile.name} (${(videoFile.size / (1024 * 1024)).toFixed(2)}MB)`);
            updateProgress('transcribing', 20, 'Transcribing audio...');

            const transcriptionStart = performance.now();
            let transcriptionResult;
            try {
                transcriptionResult = await transcribeAudio(videoFile);
                const transcriptionTime = ((performance.now() - transcriptionStart) / 1000).toFixed(2);

                setTranscript(transcriptionResult.text);
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
            updateProgress('analyzing', 60, 'Finding highlights...');

            const highlightsStart = performance.now();
            const segments = await findHighlights(
                transcriptionResult.text,
                highlightConfig,
                videoMetadata.duration
            );
            const highlightsTime = ((performance.now() - highlightsStart) / 1000).toFixed(2);

            console.log(`Highlight analysis completed in ${highlightsTime}s`);
            console.log(`Found ${segments.length} segments for highlights`);
            segments.forEach((segment, i) => {
                console.log(`Segment ${i + 1}: ${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s (${(segment.end - segment.start).toFixed(2)}s) - ${segment.description || 'No description'}`);
            });

            // Update processed video with segments
            setProcessedVideo(prev => prev ? {
                ...prev,
                segments,
                transcript: transcriptionResult.text,
            } : null);

            updateProgress('processing', 70, 'Generating highlight video...');
            console.log('Step 4: Generating highlight videos');

            // Generate the highlight video based on platform
            if (highlightConfig.targetPlatform === 'all') {
                // Generate all formats
                console.log('Creating videos for all platforms (YouTube, TikTok, Instagram)');
                const processingStart = performance.now();

                const outputs = await createPlatformSpecificVideos(
                    videoFile,
                    segments,
                    (step, progress, detail) => {
                        console.log(`Processing: ${step} - ${detail}`);
                        // Scale progress from 70-95%
                        const scaledProgress = 70 + (progress * 0.25);
                        updateProgress('processing', scaledProgress, detail || `Processing video (${step})...`);
                    }
                );

                const processingTime = ((performance.now() - processingStart) / 1000).toFixed(2);
                console.log(`Video processing completed in ${processingTime}s`);

                // Create object URLs for each output
                const urls: Record<string, string> = {};
                Object.entries(outputs).forEach(([platform, blob]) => {
                    urls[platform] = URL.createObjectURL(blob);
                    console.log(`Created ${platform} video: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`);
                });

                setHighlightUrls(urls);
            } else {
                // Generate just the selected format
                let dimensions;
                switch (highlightConfig.targetPlatform) {
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

                console.log(`Creating video for ${highlightConfig.targetPlatform} platform`);
                const processingStart = performance.now();

                const highlightVideo = await createHighlightVideo(
                    videoFile,
                    segments,
                    'mp4',
                    dimensions,
                    (step, progress, detail) => {
                        console.log(`Processing: ${step} - ${detail}`);
                        // Scale progress from 70-95%
                        const scaledProgress = 70 + (progress * 0.25);
                        updateProgress('processing', scaledProgress, detail || `Processing video (${step})...`);
                    }
                );

                const processingTime = ((performance.now() - processingStart) / 1000).toFixed(2);
                console.log(`Video processing completed in ${processingTime}s`);
                console.log(`Output video size: ${(highlightVideo.size / (1024 * 1024)).toFixed(2)}MB`);

                const highlightUrl = URL.createObjectURL(highlightVideo);
                setHighlightUrls({ [highlightConfig.targetPlatform]: highlightUrl });
            }

            console.log('--- Video processing complete ---');
            updateProgress('completed', 100, 'Highlight video ready!');
        } catch (err) {
            console.error('Error during video processing:', err);
            updateProgress('error', 0, err instanceof Error ? err.message : 'Failed to process video');
        }
    };

    const renderMainContent = () => {
        // Step 2: Upload video
        if (!videoFile) {
            return (
                <div className="max-w-2xl mx-auto w-full">
                    <h2 className="text-2xl font-bold mb-6">Upload Your Video</h2>
                    <VideoUploader
                        onVideoSelected={handleVideoSelected}
                        isProcessing={progress.status !== 'idle'}
                        progress={progress}
                    />
                </div>
            );
        }

        // Step 3: Configure settings
        if (videoFile && videoUrl && !processedVideo?.segments?.length) {
            return (
                <div className="w-full">
                    <h2 className="text-2xl font-bold mb-6">Configure Highlight Settings</h2>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <div className="mb-6">
                                <h3 className="text-lg font-medium mb-2">Preview</h3>
                                <VideoPlayer src={videoUrl} />
                            </div>

                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                                <h4 className="font-medium text-blue-800">Video Information</h4>
                                {videoMetadata && (
                                    <div className="mt-2 text-sm text-blue-700">
                                        <p>Duration: {Math.floor(videoMetadata.duration / 60)}m {Math.floor(videoMetadata.duration % 60)}s</p>
                                        <p>Resolution: {videoMetadata.width}x{videoMetadata.height}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-2">Highlight Settings</h3>
                            <HighlightConfig
                                onChange={handleConfigChange}
                                initialConfig={highlightConfig}
                                disabled={progress.status !== 'idle'}
                            />

                            <div className="mt-6">
                                <button
                                    onClick={processVideo}
                                    disabled={progress.status !== 'idle' || isLoading}
                                    className={`w-full py-3 px-4 rounded-md text-white font-medium
                    ${progress.status !== 'idle' || isLoading
                                            ? 'bg-blue-300 cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-700 transition-colors'}
                  `}
                                >
                                    {isLoading || progress.status !== 'idle'
                                        ? 'Processing...'
                                        : 'Generate Highlights'}
                                </button>

                                {error && (
                                    <p className="mt-2 text-sm text-red-600">{error}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Step 4: View and download results
        if (processedVideo?.segments?.length) {
            return (
                <div className="w-full">
                    <h2 className="text-2xl font-bold mb-6">Your Highlights</h2>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            {Object.keys(highlightUrls).length > 0 && (
                                <div className="mb-6">
                                    <h3 className="text-lg font-medium mb-2">
                                        {Object.keys(highlightUrls).length === 1
                                            ? 'Preview Your Highlight'
                                            : 'Preview Your Highlights'}
                                    </h3>

                                    {Object.keys(highlightUrls).length === 1 ? (
                                        <VideoPlayer
                                            src={Object.values(highlightUrls)[0]}
                                            segments={processedVideo.segments}
                                            autoPlay
                                        />
                                    ) : (
                                        <div className="space-y-4">
                                            {Object.entries(highlightUrls).map(([platform, url]) => (
                                                <div key={platform} className="border border-gray-200 rounded-lg p-4">
                                                    <h4 className="font-medium mb-2 capitalize">{platform} Format</h4>
                                                    <VideoPlayer src={url} autoPlay={false} />
                                                    <a
                                                        href={url}
                                                        download={`highlight-${platform}.mp4`}
                                                        className="mt-2 inline-block py-2 px-4 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                                                    >
                                                        Download
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-2">Highlight Details</h3>
                            <div className="border border-gray-200 rounded-lg p-4">
                                <div className="mb-4">
                                    <h4 className="font-medium text-gray-700">Segments Found</h4>
                                    <p className="text-gray-600">{processedVideo.segments.length} segments, {Math.floor(
                                        processedVideo.segments.reduce((acc, segment) => acc + (segment.end - segment.start), 0)
                                    )} seconds total</p>
                                </div>

                                <div className="mb-4">
                                    <h4 className="font-medium text-gray-700">Highlight Style</h4>
                                    <p className="text-gray-600 capitalize">{processedVideo.highlightConfig.mode}</p>
                                </div>

                                {Object.keys(highlightUrls).length === 1 && (
                                    <div className="mb-4">
                                        <h4 className="font-medium text-gray-700">Download</h4>
                                        <a
                                            href={Object.values(highlightUrls)[0]}
                                            download={`highlight.mp4`}
                                            className="mt-2 inline-block py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                        >
                                            Download Highlight Video
                                        </a>
                                    </div>
                                )}

                                <div className="mt-6">
                                    <button
                                        onClick={() => {
                                            setVideoFile(null);
                                            setVideoUrl('');
                                            setProcessedVideo(null);
                                            setHighlightUrls({});
                                            setProgress({ status: 'idle', progress: 0 });
                                        }}
                                        className="w-full py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        Start Over
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Add Segments Gallery for individual segments */}
                    {processedVideo.originalFile && (
                        <SegmentsGallery
                            segments={processedVideo.segments}
                            originalVideo={processedVideo.originalFile}
                        />
                    )}
                </div>
            );
        }

        return null;
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            <div className="container mx-auto px-4 py-12">
                <Header />

                {!apiConfig ? (
                    <div className="mb-8">
                        <ApiKeyConfig onApiKeyConfigured={handleApiConfigured} />
                    </div>
                ) : (
                    <>
                        {renderMainContent()}

                        {/* ProcessingLog moved here so it's always rendered */}
                        <ProcessingLog
                            isProcessing={progress.status !== 'idle' && progress.status !== 'completed' && progress.status !== 'error'}
                            latestMessage={progress.message}
                        />
                    </>
                )}
            </div>
        </div>
    );
} 