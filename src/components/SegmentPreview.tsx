import { useState, useRef, useEffect } from 'react';
import { VideoSegment } from '@/types';

interface SegmentPreviewProps {
    segment: VideoSegment;
    index: number;
    originalVideo: File;
    onMaximize?: (segment: VideoSegment, url: string) => void;
}

export default function SegmentPreview({ segment, index, originalVideo, onMaximize }: SegmentPreviewProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingStatus, setLoadingStatus] = useState('Initializing...');
    const [segmentUrl, setSegmentUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const processingRef = useRef<boolean>(false);

    useEffect(() => {
        let isMounted = true;
        // Prevent concurrent processing attempts
        if (processingRef.current) return;
        processingRef.current = true;

        const generateSegmentVideo = async () => {
            // We'll use the createHighlightVideo function directly
            try {
                if (!isMounted) return;
                setIsLoading(true);
                setLoadingStatus('Loading FFmpeg...');
                setLoadingProgress(10);

                // Dynamically import to avoid bundling issues
                const { createHighlightVideo, loadFFmpeg } = await import('@/lib/utils/video-utils');

                // Make sure FFmpeg is loaded first
                await loadFFmpeg();
                if (!isMounted) return;
                setLoadingProgress(30);
                console.log(`Segment ${index + 1}: FFmpeg loaded, starting processing`);

                // Add retry logic (maximum 2 attempts)
                let attempts = 0;
                const maxAttempts = 2;
                let lastError = null;

                while (attempts < maxAttempts) {
                    try {
                        attempts++;
                        if (!isMounted) return;
                        setLoadingStatus(`Processing segment ${attempts === 1 ? '' : '(retry)'}`);
                        setLoadingProgress(40);
                        console.log(`Segment ${index + 1}: Starting attempt ${attempts}`);

                        // Create a video just for this segment
                        const segmentBlob = await createHighlightVideo(
                            originalVideo,
                            [segment],
                            'mp4',
                            undefined,
                            (step, progress, detail) => {
                                // Use the progress information from createHighlightVideo
                                if (isMounted) {
                                    setLoadingStatus(detail || step);
                                    // Scale progress from 40-100%
                                    setLoadingProgress(40 + (progress * 0.6));
                                }
                            }
                        );

                        console.log(`Segment ${index + 1}: Successfully created, size: ${segmentBlob.size} bytes`);

                        if (isMounted) {
                            const url = URL.createObjectURL(segmentBlob);
                            console.log(`Segment ${index + 1}: URL created: ${url}`);
                            setSegmentUrl(url);
                            setIsLoading(false);
                            setLoadingProgress(100);

                            // Force a UI update
                            setTimeout(() => {
                                if (videoRef.current) {
                                    videoRef.current.src = url;
                                    videoRef.current.load();
                                }
                            }, 0);
                        }
                        return; // Success, exit the function
                    } catch (err) {
                        console.error(`Attempt ${attempts}/${maxAttempts} failed for segment ${index + 1}:`, err);
                        lastError = err;

                        // Small delay before retry
                        if (attempts < maxAttempts && isMounted) {
                            setLoadingStatus(`Retry attempt in progress...`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }

                // If we get here, all attempts failed
                throw lastError;
            } catch (err) {
                console.error(`Error creating segment preview ${index + 1}:`, err);
                if (isMounted) {
                    setError(`Failed to create segment preview: ${err instanceof Error ? err.message : String(err)}`);
                    setIsLoading(false);
                }
            } finally {
                processingRef.current = false;
            }
        };

        generateSegmentVideo();

        return () => {
            isMounted = false;
            // Cleanup object URL when component unmounts
            if (segmentUrl) {
                URL.revokeObjectURL(segmentUrl);
            }
        };
    }, [segment, index, originalVideo]);

    const formatTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const mm = date.getUTCMinutes();
        const ss = date.getUTCSeconds();
        return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    };

    const handleDownload = () => {
        if (!segmentUrl) return;

        const a = document.createElement('a');
        a.href = segmentUrl;
        a.download = `segment-${index + 1}-${formatTime(segment.start)}-${formatTime(segment.end)}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <div className="font-medium">Segment {index + 1}</div>
                <div className="text-sm text-gray-500">
                    {formatTime(segment.start)} - {formatTime(segment.end)}
                    ({Math.round(segment.end - segment.start)}s)
                </div>
            </div>

            <div className="aspect-video bg-black relative">
                {isLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <svg className="animate-spin h-8 w-8 text-white mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <div className="text-sm text-center">{loadingStatus}</div>
                        <div className="w-3/4 bg-gray-700 rounded-full h-2 mt-2">
                            <div
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${loadingProgress}%` }}
                            ></div>
                        </div>
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-red-500">
                        {error}
                    </div>
                ) : (
                    <video
                        ref={videoRef}
                        id={`segment-preview-${index}`}
                        src={segmentUrl || undefined}
                        className="w-full h-full object-contain"
                        controls
                        controlsList="nodownload"
                    />
                )}
            </div>

            {segment.description && (
                <div className="p-3 text-sm border-t border-gray-200">
                    {segment.description}
                </div>
            )}

            <div className="p-3 flex space-x-2 border-t border-gray-200">
                <button
                    onClick={() => segmentUrl && onMaximize?.(segment, segmentUrl)}
                    disabled={isLoading || !!error || !segmentUrl}
                    className="flex-1 py-2 px-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition"
                >
                    Maximize
                </button>
                <button
                    onClick={handleDownload}
                    disabled={isLoading || !!error || !segmentUrl}
                    className="flex-1 py-2 px-3 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 transition"
                >
                    Download
                </button>
            </div>
        </div>
    );
} 