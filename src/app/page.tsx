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
    const [error, setError] = useState<string | null>(null);

    const { transcribeAudio, findHighlights, isLoading, error: openAIError } = useOpenAI({ apiKey: apiConfig?.apiKey });

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

            // Clear any previous highlight URLs
            setHighlightUrls({});

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

            // Update processed video with segments right away
            // This ensures segments show up immediately without waiting for combined video
            setProcessedVideo(prev => prev ? {
                ...prev,
                segments,
                transcript: transcriptionResult.text,
            } : null);

            // Mark process as completed after finding segments
            updateProgress('completed', 100, 'Segments identified and ready for viewing');
            console.log('--- Segment analysis complete ---');

        } catch (err) {
            console.error('Error during video processing:', err);
            updateProgress('error', 0, err instanceof Error ? err.message : 'Failed to process video');
        }
    };

    // New function to combine segments into one video
    const combineSegments = async () => {
        if (!processedVideo?.segments || !videoFile) {
            console.error('No segments or video file available for combining');
            return;
        }

        try {
            // Update progress to indicate we're starting the combination process
            setProgress({
                status: 'processing',
                progress: 70,
                message: 'Starting to combine segments...'
            });

            console.log('--- Starting segment combination ---');
            console.log(`Combining ${processedVideo.segments.length} segments into one video`);

            // Generate the highlight video based on platform
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

            const processingStart = performance.now();

            try {
                const highlightVideo = await createHighlightVideo(
                    videoFile,
                    processedVideo.segments,
                    'mp4',
                    dimensions,
                    (step, progress, detail) => {
                        console.log(`Processing: ${step} - ${detail}`);
                        // Scale progress from 70-95%
                        const scaledProgress = 70 + (progress * 0.25);
                        setProgress({
                            status: 'processing',
                            progress: scaledProgress,
                            message: detail || `Processing video (${step})...`
                        });
                    }
                );

                const processingTime = ((performance.now() - processingStart) / 1000).toFixed(2);
                console.log(`Video processing completed in ${processingTime}s`);
                console.log(`Output video size: ${(highlightVideo.size / (1024 * 1024)).toFixed(2)}MB`);

                const highlightUrl = URL.createObjectURL(highlightVideo);
                console.log(`Created URL: ${highlightUrl}`);

                // Set highlight URLs
                setHighlightUrls({ [highlightConfig.targetPlatform]: highlightUrl });

                // Force a small delay to ensure state updates propagate
                await new Promise(resolve => setTimeout(resolve, 300));

                // Mark combination as completed
                setProgress({
                    status: 'completed',
                    progress: 100,
                    message: 'Combined video ready!'
                });
            } catch (error) {
                console.error('Error creating combined video:', error);
                setProgress({
                    status: 'error',
                    progress: 0,
                    message: `Failed to combine segments: ${error instanceof Error ? error.message : String(error)}`
                });
            }
        } catch (err) {
            console.error('Error combining segments:', err);
            setProgress({
                status: 'error',
                progress: 0,
                message: err instanceof Error ? err.message : 'Failed to combine segments'
            });
        }
    };

    // Render the combined video section only if segments exist
    const renderCombinedVideoSection = () => {
        // Only show if there are segments
        if (!processedVideo?.segments?.length) return null;

        return (
            <div className="mt-10 mb-6">
                <h2 className="text-xl font-bold mb-6">Combined Highlight Video</h2>
                {Object.keys(highlightUrls).length > 0 ? (
                    <div>
                        <div className="mb-6">
                            <div className="border border-gray-200 rounded-lg p-4">
                                <h3 className="text-lg font-medium mb-2">Complete Highlight</h3>
                                <VideoPlayer
                                    src={Object.values(highlightUrls)[0]}
                                    segments={processedVideo.segments}
                                    autoPlay={false}
                                />
                                <a
                                    href={Object.values(highlightUrls)[0]}
                                    download={`highlight.mp4`}
                                    className="mt-4 inline-block py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                >
                                    Download Highlight Video
                                </a>
                            </div>
                        </div>
                    </div>
                ) : progress.status === 'processing' ? (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center">
                        <svg className="animate-spin h-5 w-5 text-blue-600 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-blue-700">Generating combined highlight video... {Math.round(progress.progress)}%</span>
                    </div>
                ) : (
                    <div className="p-4 bg-white border border-gray-200 rounded-lg">
                        <h3 className="text-lg font-medium mb-2">Create a Combined Video</h3>
                        <p className="text-gray-600 mb-4">
                            You can combine all segments into a single highlight video. This may take a few moments to process.
                        </p>
                        <button
                            onClick={combineSegments}
                            disabled={progress.status === 'processing'}
                            className="py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                        >
                            {progress.status === 'processing' ? 'Processing...' : 'Combine Segments Into Video'}
                        </button>
                    </div>
                )}
            </div>
        );
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
                                        : 'Generate Segments'}
                                </button>

                                {openAIError && (
                                    <p className="mt-2 text-sm text-red-600">{openAIError}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Step 4: View segments and optionally create combined video
        if (processedVideo?.segments?.length) {
            return (
                <div className="w-full">
                    <h2 className="text-2xl font-bold mb-6">Your Highlights</h2>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                        <div>
                            <h3 className="text-lg font-medium mb-2">Original Video</h3>
                            <div className="mb-6">
                                <VideoPlayer src={videoUrl} />
                            </div>
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

                    {/* Combined Highlight Video Section */}
                    {renderCombinedVideoSection()}
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