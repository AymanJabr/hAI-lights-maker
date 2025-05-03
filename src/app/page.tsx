'use client';

import { useState } from 'react';
import ApiKeyConfig from '@/components/ApiKeyConfig';
import ProcessingLog from '@/components/ProcessingLog';
import Header from '@/components/layout/Header';
import VideoUploadSection from '@/components/VideoUploadSection';
import ConfigurationSection from '@/components/ConfigurationSection';
import ResultsSection from '@/components/ResultsSection';
import SegmentReviewScreen from '@/components/SegmentReviewScreen';
import { ApiKeyConfig as ApiKeyConfigType, HighlightConfig as HighlightConfigType, ProcessedVideo, VideoMetadata, ProgressState, VideoSegment } from '@/types';
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
    const [suggestedSegments, setSuggestedSegments] = useState<VideoSegment[]>([]);
    const [approvedSegments, setApprovedSegments] = useState<VideoSegment[]>([]);
    const [highlightUrls, setHighlightUrls] = useState<Record<string, string>>({});
    const [transcript, setTranscript] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState<'upload' | 'configure' | 'review' | 'results'>('upload');

    // Always call useVideoProcessor, pass apiKey only if it exists
    const videoProcessor = useVideoProcessor({
        apiKey: apiConfig?.apiKey || '',
        videoFile,
        videoMetadata,
        highlightConfig,
        onProgress: setProgress,
        onProcessingComplete: (video, transcriptText) => {
            setSuggestedSegments(video.segments);
            setTranscript(transcriptText);
            setCurrentStep('review');
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
        setCurrentStep('configure');
    };

    const handleConfigChange = (config: HighlightConfigType) => {
        setHighlightConfig(config);
    };

    const handleProcessVideo = async () => {
        if (!videoProcessor || !apiConfig?.apiKey) return;
        await videoProcessor.processVideo();
    };

    const handleApproveSegments = (segments: VideoSegment[]) => {
        setApprovedSegments(segments);

        // Create the processed video object using the approved segments
        if (videoFile) {
            const processedVideoWithApprovedSegments: ProcessedVideo = {
                id: processedVideo?.id || crypto.randomUUID(),
                originalFile: videoFile,
                segments: segments,
                highlightConfig,
                transcript
            };

            setProcessedVideo(processedVideoWithApprovedSegments);
            setCurrentStep('results');
        }
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
        setSuggestedSegments([]);
        setApprovedSegments([]);
        setHighlightUrls({});
        setProgress({ status: 'idle', progress: 0 });
        setCurrentStep('upload');
    };

    const handleBackToConfig = () => {
        setCurrentStep('configure');
    };

    const renderMainContent = () => {
        // Step 1: Upload video
        if (currentStep === 'upload') {
            return (
                <VideoUploadSection
                    onVideoSelected={handleVideoSelected}
                    progress={progress}
                />
            );
        }

        // Step 2: Configure settings
        if (currentStep === 'configure') {
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

        // Step 3: Review segments
        if (currentStep === 'review') {
            return (
                <SegmentReviewScreen
                    videoUrl={videoUrl}
                    transcript={transcript}
                    suggestedSegments={suggestedSegments}
                    videoMetadata={videoMetadata}
                    onApproveSegments={handleApproveSegments}
                    onBack={handleBackToConfig}
                />
            );
        }

        // Step 4: View results
        if (currentStep === 'results' && processedVideo?.segments?.length) {
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