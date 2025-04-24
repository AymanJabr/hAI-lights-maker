'use client';

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import VideoUploader from '@/components/VideoUploader';
import HighlightConfig from '@/components/HighlightConfig';
import VideoPlayer from '@/components/VideoPlayer';
import ApiKeyConfig from '@/components/ApiKeyConfig';
import Header from '@/components/layout/Header';
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
            setProgress({ status: 'uploading', progress: 0 });
            setVideoFile(file);

            // Create object URL for the video
            const url = URL.createObjectURL(file);
            setVideoUrl(url);

            // Get video metadata
            setProgress({ status: 'uploading', progress: 30, message: 'Analyzing video...' });
            const metadata = await getVideoMetadata(file);
            setVideoMetadata(metadata);

            setProgress({ status: 'idle', progress: 100 });
        } catch (err) {
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

        try {
            // Create a new processed video object
            const videoId = uuidv4();
            setProcessedVideo({
                id: videoId,
                originalFile: videoFile,
                segments: [],
                highlightConfig,
            });

            // Extract audio and transcribe
            setProgress({ status: 'transcribing', progress: 0, message: 'Extracting audio...' });

            // TODO: In a production app, we would extract audio to a smaller file first
            // For now, we'll just use the video file directly
            setProgress({ status: 'transcribing', progress: 20, message: 'Transcribing audio...' });
            const transcriptionResult = await transcribeAudio(videoFile);
            setTranscript(transcriptionResult.text);
            setProgress({ status: 'transcribing', progress: 50, message: 'Transcription complete' });

            // Find highlights based on transcript
            setProgress({ status: 'analyzing', progress: 60, message: 'Finding highlights...' });
            const segments = await findHighlights(
                transcriptionResult.text,
                highlightConfig,
                videoMetadata.duration
            );

            // Update processed video with segments
            setProcessedVideo(prev => prev ? {
                ...prev,
                segments,
                transcript: transcriptionResult.text,
            } : null);

            setProgress({ status: 'processing', progress: 70, message: 'Generating highlight video...' });

            // Generate the highlight video based on platform
            if (highlightConfig.targetPlatform === 'all') {
                // Generate all formats
                const outputs = await createPlatformSpecificVideos(videoFile, segments);

                // Create object URLs for each output
                const urls: Record<string, string> = {};
                Object.entries(outputs).forEach(([platform, blob]) => {
                    urls[platform] = URL.createObjectURL(blob);
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

                const highlightVideo = await createHighlightVideo(
                    videoFile,
                    segments,
                    'mp4',
                    dimensions
                );

                const highlightUrl = URL.createObjectURL(highlightVideo);
                setHighlightUrls({ [highlightConfig.targetPlatform]: highlightUrl });
            }

            setProgress({ status: 'completed', progress: 100, message: 'Highlight video ready!' });
        } catch (err) {
            setProgress({
                status: 'error',
                progress: 0,
                error: err instanceof Error ? err.message : 'Failed to process video'
            });
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
                    <>{renderMainContent()}</>
                )}
            </div>
        </div>
    );
} 