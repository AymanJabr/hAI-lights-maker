import { useState, useRef, useEffect } from 'react';
import { VideoSegment } from '@/types';
import VideoPlayer from '@/components/VideoPlayer';

// Declare global window properties
declare global {
    interface Window {
        _totalSegmentsCount?: number;
        _lastCreatedVideoBlob?: Blob;
    }
}

// Count of total segments and completed segments 
let totalSegments = 0;
let completedSegments = 0;
let segmentsAllCompleted = false;

// Function to check and update completion status
function updateSegmentCompletionStatus(isComplete: boolean) {
    if (isComplete) {
        completedSegments++;
    }

    segmentsAllCompleted = completedSegments === totalSegments && totalSegments > 0;

    // Dispatch a custom event when all segments are completed
    if (segmentsAllCompleted && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('segmentsProcessingComplete', {
            detail: { completedSegments, totalSegments }
        }));
    }
}

// Export a function to check if all segments are ready
export function areAllSegmentsReady(): boolean {
    return segmentsAllCompleted;
}

// Reset the counts when needed
export function resetSegmentCounts() {
    completedSegments = 0;
    totalSegments = 0;
    segmentsAllCompleted = false;
}

interface SegmentPreviewProps {
    segment: VideoSegment;
    index: number;
    originalVideo: File;
    ready?: boolean; // New prop to control when processing starts
}

// Create a task manager for sequential processing
type Task = {
    id: number;
    execute: () => Promise<void>;
    onComplete?: () => void;
    onFailure?: (error: unknown) => void;
    priority?: number; // Lower number = higher priority
};

// Global task queue and processing state
const taskQueue: Task[] = [];
let isProcessing = false;
let nextTaskId = 1;

// Process one task at a time with retries
async function processNextTask() {
    if (isProcessing || taskQueue.length === 0) return;

    isProcessing = true;

    // Sort by priority (if set)
    taskQueue.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    const currentTask = taskQueue.shift();

    if (currentTask) {
        console.log(`Processing task ID: ${currentTask.id}${currentTask.priority ? ` (priority: ${currentTask.priority})` : ''}`);

        let success = false;
        let retries = 0;
        const maxRetries = 1;

        while (!success && retries <= maxRetries) {
            try {
                if (retries > 0) {
                    console.log(`Retry attempt ${retries} for task ID: ${currentTask.id}`);
                    // Small delay before retry
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                await currentTask.execute();
                console.log(`Completed task ID: ${currentTask.id}`);
                // Call the completion callback if provided
                currentTask.onComplete?.();
                success = true;
            } catch (error) {
                console.error(`Error in task ID: ${currentTask.id}:`, error);
                retries++;

                if (retries > maxRetries) {
                    console.error(`Task ID: ${currentTask.id} failed after ${maxRetries} retries`);
                    // Call failure callback if provided
                    currentTask.onFailure?.(error);
                }
            }
        }

        isProcessing = false;
        // Continue with next task with a small delay
        setTimeout(processNextTask, 100); // Small delay to prevent CPU hogging
    } else {
        isProcessing = false;
    }
}

// Allow canceling a task by ID
function cancelTask(id: number): boolean {
    const index = taskQueue.findIndex(task => task.id === id);
    if (index !== -1) {
        taskQueue.splice(index, 1);
        console.log(`Canceled task ID: ${id}`);
        return true;
    }
    return false;
}

export default function SegmentPreview({ segment, index, originalVideo, ready = false }: SegmentPreviewProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingStatus, setLoadingStatus] = useState(ready ? 'Waiting in queue...' : 'Queued...');
    const [segmentUrl, setSegmentUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const taskId = useRef<number>(nextTaskId++);
    const segmentInfo = useRef<string>(`${segment.start.toFixed(2)}-${segment.end.toFixed(2)}`);
    const isMounted = useRef<boolean>(true);
    const processingStarted = useRef<boolean>(false);

    // Update loading status when ready changes
    useEffect(() => {
        if (ready && isLoading) {
            setLoadingStatus('Waiting in queue...');
        }
    }, [ready, isLoading]);

    useEffect(() => {
        // Set isMounted ref
        isMounted.current = true;

        // Update total segments count from window if available
        if (typeof window !== 'undefined' && window._totalSegmentsCount) {
            totalSegments = window._totalSegmentsCount;
        }

        // Function to generate a video for this segment
        const generateSegmentVideo = async () => {
            try {
                if (!isMounted.current) return;

                setIsLoading(true);
                setLoadingStatus('Loading FFmpeg...');
                setLoadingProgress(10);

                // Make sure we have a fresh FFmpeg instance
                const { createHighlightVideo, calculateAdaptiveDimensions, releaseFFmpeg } = await import('@/lib/utils/video-utils');

                if (!isMounted.current) return;
                setLoadingProgress(30);
                console.log(`Segment ${index + 1} (${segmentInfo.current}): Starting processing`);
                console.log(`Segment ${index + 1} has targetPlatform: ${segment.targetPlatform || 'not set'}`);

                try {
                    setLoadingStatus('Processing segment...');
                    setLoadingProgress(40);

                    // Get video metadata first to calculate target dimensions
                    const { getVideoMetadata } = await import('@/lib/utils/video-utils');
                    const videoMetadata = await getVideoMetadata(originalVideo);
                    console.log(`Original video dimensions: ${videoMetadata.width}x${videoMetadata.height}`);

                    // Calculate target dimensions based on the segment's targetPlatform or default to original
                    let targetDimensions;
                    if (segment.targetPlatform) {
                        let aspectRatio: number | null = null;

                        switch (segment.targetPlatform) {
                            case 'youtube':
                                aspectRatio = 16 / 9;
                                break;
                            case 'tiktok':
                                aspectRatio = 9 / 16;
                                break;
                            case 'instagram':
                                aspectRatio = 1 / 1;
                                break;
                            case 'original':
                            default:
                                aspectRatio = null;
                                break;
                        }

                        targetDimensions = calculateAdaptiveDimensions(
                            videoMetadata.width,
                            videoMetadata.height,
                            aspectRatio
                        );

                        console.log(`Using ${segment.targetPlatform} aspect ratio: ${aspectRatio}, dimensions: ${targetDimensions.width}x${targetDimensions.height}`);
                        console.log(`Aspect ratio transformation: ${videoMetadata.width}x${videoMetadata.height} -> ${targetDimensions.width}x${targetDimensions.height}`);
                    } else {
                        console.log('No targetPlatform specified, using original dimensions');
                        console.log(`Segment properties: ${Object.keys(segment).join(', ')}`);
                        console.log(`Segment details: start=${segment.start}, end=${segment.end}, targetPlatform=${segment.targetPlatform || 'not set'}`);
                    }

                    // Create a video just for this segment
                    const segmentBlob = await createHighlightVideo(
                        originalVideo,
                        [segment],
                        'mp4',
                        targetDimensions,
                        (step, progress, detail) => {
                            if (isMounted.current) {
                                setLoadingStatus(detail || step);
                                // Scale progress from 40-100%
                                setLoadingProgress(40 + (progress * 0.6));
                            }
                        }
                    );

                    console.log(`Segment ${index + 1} (${segmentInfo.current}): Created video blob, size: ${segmentBlob.size} bytes`);

                    if (isMounted.current) {
                        // Cleanup previous URL if it exists
                        if (segmentUrl) {
                            URL.revokeObjectURL(segmentUrl);
                        }

                        // Create new URL for the video blob
                        const url = URL.createObjectURL(segmentBlob);
                        console.log(`Segment ${index + 1} (${segmentInfo.current}): URL created: ${url}`);

                        setSegmentUrl(url);
                        setIsLoading(false);
                        setLoadingProgress(100);

                        // Update the video element
                        setTimeout(() => {
                            if (videoRef.current && isMounted.current) {
                                // Reset the video element first
                                videoRef.current.pause();
                                videoRef.current.removeAttribute('src');
                                videoRef.current.load();

                                // Set the new source
                                videoRef.current.src = url;
                                videoRef.current.load();
                            }
                        }, 0);
                    }
                } catch (err) {
                    console.error(`Error for segment ${index + 1} (${segmentInfo.current}):`, err);

                    if (isMounted.current) {
                        setError(`Failed to create segment: ${err instanceof Error ? err.message : String(err)}`);
                        setIsLoading(false);
                    }

                    // Make sure FFmpeg resources are released on error
                    try {
                        await releaseFFmpeg();
                    } catch (releaseErr) {
                        console.warn('Error releasing FFmpeg resources:', releaseErr);
                    }

                    throw err; // Re-throw to trigger task retry
                }
            } catch (err) {
                console.error(`Fatal error for segment ${index + 1} (${segmentInfo.current}):`, err);

                if (isMounted.current) {
                    setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
                    setIsLoading(false);
                }

                throw err; // Re-throw to trigger task retry
            }
        };

        // Only add task to queue if ready is true and we haven't started processing yet
        if (ready && !processingStarted.current) {
            processingStarted.current = true;

            // Generate a unique task ID that includes segment information
            const uniqueTaskId = `${taskId.current}-seg${index}-${Date.now()}`;
            taskId.current = parseInt(uniqueTaskId);

            // Add this task to the queue
            const task: Task = {
                id: taskId.current,
                execute: generateSegmentVideo,
                onComplete: () => {
                    console.log(`Task for segment ${index + 1} completed successfully`);
                    updateSegmentCompletionStatus(true);
                },
                onFailure: (error) => {
                    if (isMounted.current) {
                        setError(`Processing failed after retries: ${error instanceof Error ? error.message : String(error)}`);
                        setIsLoading(false);
                    }
                },
                // Give earlier segments higher priority
                priority: index
            };

            console.log(`Adding segment ${index + 1} (${segmentInfo.current}) to queue, task ID: ${taskId.current}`);
            taskQueue.push(task);

            // Try to start processing the queue
            processNextTask();
        } else if (!ready) {
            console.log(`Segment ${index + 1} waiting for ready signal before processing`);
        }

        // Cleanup function
        return () => {
            // Mark component as unmounted
            isMounted.current = false;

            // Cleanup URL if it exists
            if (segmentUrl) {
                URL.revokeObjectURL(segmentUrl);
            }

            // Remove this task from the queue if it hasn't started yet
            cancelTask(taskId.current);
        };
    }, [segment, segment.targetPlatform, index, originalVideo, ready, segmentUrl]);

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

    // Get aspect ratio class based on platform
    const getAspectRatioClass = () => {
        switch (segment.targetPlatform) {
            case 'youtube':
                return 'aspect-video'; // 16:9
            case 'tiktok':
                return 'aspect-[9/16]'; // 9:16
            case 'instagram':
                return 'aspect-square'; // 1:1
            case 'original':
            default:
                return 'aspect-video'; // Default to 16:9 if not specified
        }
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

            <div className={`bg-black relative ${getAspectRatioClass()}`}>
                {isLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <svg className="animate-spin h-8 w-8 text-white mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <div className="text-sm text-center">{!ready ? 'Waiting for combined video to complete...' : loadingStatus}</div>
                        <div className="w-3/4 bg-gray-700 rounded-full h-2 mt-2">
                            <div
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${!ready ? 5 : loadingProgress}%` }}
                            ></div>
                        </div>
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-red-500">
                        {error}
                    </div>
                ) : (
                    <VideoPlayer
                        src={segmentUrl || ''}
                        autoPlay={false}
                        key={`video-${index}-${segmentInfo.current}`}
                        id={`segment-preview-${index}`}
                        platformFormat={segment.targetPlatform}
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
                    onClick={handleDownload}
                    disabled={isLoading || !!error || !segmentUrl}
                    className="w-full py-2 px-3 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 transition"
                >
                    Download
                </button>
            </div>
        </div>
    );
} 