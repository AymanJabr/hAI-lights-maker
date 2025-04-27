'use client';

import { useState } from 'react';
import ApiKeyConfig from '@/components/ApiKeyConfig';
import ProcessingLog from '@/components/ProcessingLog';
import Header from '@/components/layout/Header';
import VideoUploadSection from '@/components/VideoUploadSection';
import ConfigurationSection from '@/components/ConfigurationSection';
import ResultsSection from '@/components/ResultsSection';
import { ApiKeyConfig as ApiKeyConfigType, HighlightConfig as HighlightConfigType, ProcessedVideo, VideoMetadata, ProgressState } from '@/types';
import { useVideoProcessor } from '@/components/VideoProcessor';

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
    const [error, setError] = useState<string | null>(null);

    // Always call useVideoProcessor, pass apiKey only if it exists
    const videoProcessor = useVideoProcessor({
        apiKey: apiConfig?.apiKey || '',
        videoFile,
        videoMetadata,
        highlightConfig,
        onProgress: setProgress,
        onProcessingComplete: (video, transcriptText) => {
            setProcessedVideo(video);
            setTranscript(transcriptText);
        },
        onError: setError
    });

    const handleApiConfigured = (config: ApiKeyConfigType) => {
        setApiConfig(config);
    };

    const handleVideoSelected = (file: File, url: string, metadata: VideoMetadata) => {
        setVideoFile(file);
        setVideoUrl(url);
        setVideoMetadata(metadata);
    };

    const handleConfigChange = (config: HighlightConfigType) => {
        setHighlightConfig(config);
    };

    const handleProcessVideo = async () => {
        if (!videoProcessor || !apiConfig?.apiKey) return;
        await videoProcessor.processVideo();
    };

    const handleCombineSegments = async () => {
        if (!videoProcessor || !processedVideo || !apiConfig?.apiKey) return;

        try {
            const urls = await videoProcessor.combineSegments(processedVideo);
            if (urls) {
                setHighlightUrls(urls);
            }
        } catch (err) {
            console.error('Error combining segments:', err);
        }
    };

    const handleStartOver = () => {
        setVideoFile(null);
        setVideoUrl('');
        setProcessedVideo(null);
        setHighlightUrls({});
        setProgress({ status: 'idle', progress: 0 });
    };

    const renderMainContent = () => {
        // Step 1: Upload video
        if (!videoFile) {
            return (
                <VideoUploadSection
                    onVideoSelected={handleVideoSelected}
                    progress={progress}
                />
            );
        }

        // Step 2: Configure settings
        if (videoFile && videoUrl && !processedVideo?.segments?.length) {
            return (
                <ConfigurationSection
                    videoUrl={videoUrl}
                    videoMetadata={videoMetadata}
                    highlightConfig={highlightConfig}
                    onConfigChange={handleConfigChange}
                    onGenerateSegments={handleProcessVideo}
                    progress={progress}
                    isLoading={videoProcessor?.isLoading || false}
                    openAIError={videoProcessor?.openAIError || null}
                />
            );
        }

        // Step 3: View results
        if (processedVideo?.segments?.length) {
            return (
                <ResultsSection
                    processedVideo={processedVideo}
                    videoUrl={videoUrl}
                    onStartOver={handleStartOver}
                    highlightUrls={highlightUrls}
                    progress={progress}
                    onCombineSegments={handleCombineSegments}
                />
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

                        {/* ProcessingLog is always rendered when processing */}
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