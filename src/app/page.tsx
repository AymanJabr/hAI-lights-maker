'use client';

import { useState, useEffect } from 'react';
import ApiKeyConfig from '@/components/ApiKeyConfig';
import ProcessingLog from '@/components/ProcessingLog';
import Header from '@/components/layout/Header';
import VideoUploadSection from '@/components/VideoUploadSection';
import ConfigurationSection from '@/components/ConfigurationSection';
import ResultsSection from '@/components/ResultsSection';
import SegmentReviewScreen from '@/components/SegmentReviewScreen';
import { ApiKeyConfig as ApiKeyConfigType, HighlightConfig as HighlightConfigType, ProcessedVideo, VideoMetadata, ProgressState, VideoSegment } from '@/types';
import { useVideoProcessor } from '@/components/VideoProcessor';

// Basic Modal Component (can be moved to its own file and styled)
interface ErrorModalProps {
    isOpen: boolean;
    message: string | null;
    onClose: () => void;
}
const ErrorModal: React.FC<ErrorModalProps> = ({ isOpen, message, onClose }) => {
    if (!isOpen || !message) return null;
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', color: 'black' }}>
                <h3>Error</h3>
                <p>{message}</p>
                <button onClick={onClose} style={{ marginTop: '10px' }}>Close</button>
            </div>
        </div>
    );
};

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
    const [isFileSizeErrorModalOpen, setIsFileSizeErrorModalOpen] = useState(false);
    const [currentStep, setCurrentStep] = useState<'upload' | 'configure' | 'review' | 'results'>('upload');

    // Effect to watch for file size errors and trigger the modal
    useEffect(() => {
        if (error && error.includes('File exceeds') && error.includes('GB size limit')) {
            setIsFileSizeErrorModalOpen(true);
            // Keep the original error in the 'error' state so ConfigurationSection can still see it if needed,
            // or set setError(null) if this modal should be the ONLY way this specific error is shown.
            // For now, let's assume the modal is primary for this specific error.
        }
    }, [error]);

    const closeFileSizeErrorModal = () => {
        setIsFileSizeErrorModalOpen(false);
        setError(null); // Clear the main error state when modal is closed
    };

    // Always call useVideoProcessor, pass apiKey only if it exists
    const videoProcessor = useVideoProcessor({
        apiKey: apiConfig?.apiKey || '',
        videoFile,
        videoMetadata,
        highlightConfig,
        onProgress: setProgress,
        onProcessingComplete: (video, transcriptText) => {
            setError(null); // Clear any previous errors on successful completion
            setSuggestedSegments(video.segments);
            setTranscript(transcriptText);
            setCurrentStep('review');
        },
        onError: (errorMessage: string) => {
            // The `errorMessage` here is already the string from ApiError or generic error
            setError(errorMessage);
        }
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
                    openAIError={isFileSizeErrorModalOpen ? null : error}
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
                    onStartOver={handleStartOver}
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

            <ErrorModal
                isOpen={isFileSizeErrorModalOpen}
                message={error} // The 'error' state will contain the specific message
                onClose={closeFileSizeErrorModal}
            />
        </div>
    );
} 