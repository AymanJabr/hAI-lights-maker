import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { VideoSegment, VideoMetadata, TranscriptionResult } from '@/types';
import VideoPlayer from '@/components/VideoPlayer';

interface SegmentReviewScreenProps {
    videoUrl: string;
    transcript: string;
    transcriptionResult?: TranscriptionResult;
    suggestedSegments: VideoSegment[];
    videoMetadata: VideoMetadata | null;
    onApproveSegments: (segments: VideoSegment[]) => void;
    onStartOver: () => void;
}

export default function SegmentReviewScreen({
    videoUrl,
    transcript,
    transcriptionResult,
    suggestedSegments,
    videoMetadata,
    onApproveSegments,
    onStartOver
}: SegmentReviewScreenProps) {
    // Create a mutable copy of segments for editing
    const [segments, setSegments] = useState<VideoSegment[]>(
        suggestedSegments.map(segment => ({ ...segment }))
    );
    const [currentSegment, setCurrentSegment] = useState<number | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [segmentPlaybackActive, setSegmentPlaybackActive] = useState(false);

    // Format transcript for better readability
    const formattedTranscript = useMemo(() => {
        if (!transcript) return '';

        // Split into sentences
        let text = transcript;

        // Ensure periods have spaces after them
        text = text.replace(/\.(?=[A-Za-z])/g, '. ');

        // Ensure proper spacing after other punctuation
        text = text.replace(/([,:;])(?=[A-Za-z])/g, '$1 ');

        // Split into paragraphs (looking for natural breaks)
        const sentences = text.split(/(?<=[.!?])\s+/);
        const paragraphs = [];
        let currentParagraph = '';

        // Group sentences into paragraphs of 2-3 sentences
        for (let i = 0; i < sentences.length; i++) {
            currentParagraph += sentences[i] + ' ';

            // Create a new paragraph every 2-3 sentences or when paragraph gets long
            if (
                (i % 3 === 2) ||
                currentParagraph.length > 250 ||
                i === sentences.length - 1
            ) {
                if (currentParagraph.trim()) {
                    paragraphs.push(currentParagraph.trim());
                }
                currentParagraph = '';
            }
        }

        // Join paragraphs with double line breaks
        return paragraphs.join('\n\n');
    }, [transcript]);

    // Function to format time as mm:ss - defined BEFORE it's used in renderTranscriptWithTimestamps
    const formatTime = (timeInSeconds: number) => {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Display transcript with timestamps if available
    const renderTranscriptWithTimestamps = useMemo(() => {
        if (!transcriptionResult?.segments || transcriptionResult.segments.length === 0) {
            // Fall back to formatted transcript if no segments
            return formattedTranscript;
        }

        // Create the transcript with timestamps
        return (
            <div className="space-y-4">
                {transcriptionResult.segments.map((segment, index) => (
                    <div key={index} className="pb-4 border-b border-gray-100 last:border-0">
                        <div className="text-gray-500 text-xs mb-2 font-mono">
                            [{formatTime(segment.start)} - {formatTime(segment.end)}]
                        </div>
                        <div className="break-words">{segment.text}</div>
                    </div>
                ))}
            </div>
        );
    }, [transcriptionResult, formattedTranscript]);

    // Function to update a segment
    const updateSegment = (index: number, updates: Partial<VideoSegment>) => {
        setSegments(prev => {
            const newSegments = [...prev];

            // Create the updated segment
            const updatedSegment = { ...newSegments[index], ...updates };

            // If updating start time, ensure end time is at least 1 second later
            if ('start' in updates && updatedSegment.end <= updatedSegment.start) {
                updatedSegment.end = updatedSegment.start + 1;
            }

            // If updating end time, ensure it's at least 1 second after start time
            if ('end' in updates && updatedSegment.end <= updatedSegment.start) {
                updatedSegment.end = updatedSegment.start + 1;
            }

            newSegments[index] = updatedSegment;
            return newSegments;
        });
    };

    // Effect to handle video seeking when a segment is selected
    useEffect(() => {
        if (currentSegment !== null && videoRef.current && segments[currentSegment]) {
            // Set the current time to the segment start
            videoRef.current.currentTime = segments[currentSegment].start;
            // Activate segment mode when segment is selected
            setSegmentPlaybackActive(true);
        }
    }, [currentSegment, segments]);

    // Effect to monitor video playback and pause at segment end only in segment mode
    useEffect(() => {
        const videoElement = videoRef.current;
        if (!videoElement) return;

        const handleTimeUpdate = () => {
            if (currentSegment !== null && segments[currentSegment] && segmentPlaybackActive) {
                const { end } = segments[currentSegment];
                if (videoElement.currentTime >= end) {
                    videoElement.pause();
                    // Ensure we stop exactly at the end point
                    videoElement.currentTime = end;
                }
            }
        };

        videoElement.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
            videoElement.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, [currentSegment, segments, segmentPlaybackActive]);

    // Custom handler for when user interacts directly with the video player
    const handleDirectVideoInteraction = () => {
        // Disable segment mode when user interacts directly with video player
        setSegmentPlaybackActive(false);
    };

    // Function to add a new segment
    const addSegment = () => {
        // Default to adding a segment at the start if no video metadata
        const videoDuration = videoMetadata?.duration || 60;
        const newSegment: VideoSegment = {
            start: 0,
            end: Math.min(10, videoDuration),
            description: "New segment"
        };

        setSegments(prev => [...prev, newSegment]);
        // Select the newly added segment
        setCurrentSegment(segments.length);
    };

    // Function to remove a segment
    const removeSegment = (index: number) => {
        setSegments(prev => prev.filter((_, i) => i !== index));
        if (currentSegment === index) {
            setCurrentSegment(null);
        } else if (currentSegment !== null && currentSegment > index) {
            setCurrentSegment(currentSegment - 1);
        }
    };

    // Function to handle segment selection
    const handleSegmentSelect = (index: number) => {
        setCurrentSegment(index);
    };

    // Function to adjust time by small increments
    const adjustTime = (index: number, field: 'start' | 'end', delta: number) => {
        if (index === null) return;

        setSegments(prev => {
            const newSegments = [...prev];
            const segment = { ...newSegments[index] };
            const maxDuration = videoMetadata?.duration || 3600;

            if (field === 'start') {
                // Ensure start can't go below 0 or above maxDuration-1
                segment.start = Math.max(0, Math.min(maxDuration - 1, segment.start + delta));
                // Ensure end is at least 1 second after start
                if (segment.end <= segment.start + 1) {
                    segment.end = segment.start + 1;
                }
            } else {
                // Ensure end can't exceed video duration
                segment.end = Math.min(maxDuration, segment.end + delta);
                // Ensure end is at least 1 second after start
                if (segment.end <= segment.start + 1) {
                    segment.end = segment.start + 1;
                }
            }

            newSegments[index] = segment;
            return newSegments;
        });
    };

    // Function to convert MM:SS format to seconds
    const timeToSeconds = (timeString: string): number => {
        const [minutesStr, secondsStr] = timeString.split(':');
        const minutes = parseInt(minutesStr, 10) || 0;
        const seconds = parseInt(secondsStr, 10) || 0;
        return minutes * 60 + seconds;
    };

    // Function to convert seconds to MM:SS format
    const secondsToTime = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    // Function to handle time input changes
    const handleTimeChange = (index: number, field: 'start' | 'end', value: string) => {
        // Handle MM:SS format
        if (value.includes(':')) {
            const timeInSeconds = timeToSeconds(value);
            const maxTime = videoMetadata?.duration || 3600;

            // Apply min/max boundaries
            if (field === 'start') {
                const boundedTime = Math.min(Math.max(0, timeInSeconds), maxTime - 1);
                updateSegment(index, { [field]: boundedTime });
            } else {
                const boundedTime = Math.min(Math.max(0, timeInSeconds), maxTime);
                updateSegment(index, { [field]: boundedTime });
            }
        }
    };

    // Function to handle slider change
    const handleSliderChange = (index: number, field: 'start' | 'end', value: string) => {
        const timeInSeconds = parseFloat(value);
        if (!isNaN(timeInSeconds)) {
            updateSegment(index, { [field]: timeInSeconds });
        }
    };

    // Check if segments overlap or have other issues - wrapped in useCallback
    const validateSegments = useCallback(() => {
        // Reset validation error
        setValidationError(null);

        // Check if there are any segments
        if (segments.length === 0) {
            setValidationError("You need to create at least one segment");
            return false;
        }

        // Check each segment individually first
        for (const segment of segments) {
            // End time must be at least 1 second after start time
            if (segment.end <= segment.start) {
                setValidationError("Each segment's end time must be after its start time");
                return false;
            }
        }

        // Sort segments by start time
        const sortedSegments = [...segments].sort((a, b) => a.start - b.start);

        // Check for overlaps
        for (let i = 0; i < sortedSegments.length - 1; i++) {
            if (sortedSegments[i].end > sortedSegments[i + 1].start) {
                setValidationError("Segments cannot overlap. Adjust the timing of your segments so they don't intersect.");
                return false;
            }
        }

        return true;
    }, [segments]);

    // Play the current segment from start to end
    const playCurrentSegment = () => {
        if (currentSegment === null || !videoRef.current) return;

        const segment = segments[currentSegment];
        videoRef.current.currentTime = segment.start;
        setSegmentPlaybackActive(true);
        videoRef.current.play().catch(e => console.error("Error playing video:", e));
    };

    // Run validation whenever segments change
    useMemo(() => {
        validateSegments();
    }, [validateSegments]);

    const isValid = !validationError;
    const maxDuration = videoMetadata?.duration || 3600;

    return (
        <div className="w-full">
            <h2 className="text-2xl font-bold mb-6">Review Suggested Segments</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 className="text-lg font-medium mb-2">Original Video</h3>
                    <div className="mb-4 relative">
                        <VideoPlayer
                            src={videoUrl}
                            ref={videoRef}
                            onDirectInteraction={handleDirectVideoInteraction}
                        />
                        {currentSegment !== null && (
                            <div className="mt-2 flex justify-between items-center">
                                <div className="text-sm text-gray-600">
                                    Selected: <span className="font-medium">{formatTime(segments[currentSegment].start)} - {formatTime(segments[currentSegment].end)}</span>
                                </div>
                                <button
                                    onClick={playCurrentSegment}
                                    className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 flex items-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                    </svg>
                                    Play Segment
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-medium">Suggested Segments ({segments.length})</h3>
                        <button
                            onClick={addSegment}
                            className="py-1 px-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                        >
                            Add Segment
                        </button>
                    </div>

                    <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                        {segments.map((segment, index) => (
                            <div
                                key={index}
                                className={`p-3 border-b border-gray-200 cursor-pointer ${currentSegment === index ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'}`}
                                onClick={() => handleSegmentSelect(index)}
                            >
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="font-medium">Segment {index + 1}</span>
                                        <p className="text-sm text-gray-600 mt-1">
                                            {formatTime(segment.start)} - {formatTime(segment.end)} ({Math.floor(segment.end - segment.start)} seconds)
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeSegment(index);
                                        }}
                                        className="text-red-500 hover:text-red-700"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">{segment.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {currentSegment !== null && (
                <div className="mb-8 p-4 border border-gray-200 rounded-lg">
                    <h3 className="text-lg font-medium mb-4">Edit Segment {currentSegment + 1}</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-medium text-gray-700">Start Time</label>
                                    <div className="flex items-center">
                                        <button
                                            onClick={() => adjustTime(currentSegment, 'start', -1)}
                                            className="px-2 py-1 bg-gray-200 rounded-l-md hover:bg-gray-300 text-sm"
                                        >
                                            -1s
                                        </button>
                                        <input
                                            type="text"
                                            placeholder="00:00"
                                            value={secondsToTime(segments[currentSegment].start)}
                                            onChange={(e) => handleTimeChange(currentSegment, 'start', e.target.value)}
                                            className="w-16 text-center px-2 py-1 border border-gray-300"
                                        />
                                        <button
                                            onClick={() => adjustTime(currentSegment, 'start', 1)}
                                            className="px-2 py-1 bg-gray-200 rounded-r-md hover:bg-gray-300 text-sm"
                                        >
                                            +1s
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max={maxDuration - 1}
                                    step="1"
                                    value={segments[currentSegment].start}
                                    onChange={(e) => handleSliderChange(currentSegment, 'start', e.target.value)}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-medium text-gray-700">End Time</label>
                                    <div className="flex items-center">
                                        <button
                                            onClick={() => adjustTime(currentSegment, 'end', -1)}
                                            className="px-2 py-1 bg-gray-200 rounded-l-md hover:bg-gray-300 text-sm"
                                        >
                                            -1s
                                        </button>
                                        <input
                                            type="text"
                                            placeholder="00:00"
                                            value={secondsToTime(segments[currentSegment].end)}
                                            onChange={(e) => handleTimeChange(currentSegment, 'end', e.target.value)}
                                            className="w-16 text-center px-2 py-1 border border-gray-300"
                                        />
                                        <button
                                            onClick={() => adjustTime(currentSegment, 'end', 1)}
                                            className="px-2 py-1 bg-gray-200 rounded-r-md hover:bg-gray-300 text-sm"
                                        >
                                            +1s
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max={maxDuration}
                                    step="1"
                                    value={segments[currentSegment].end}
                                    onChange={(e) => handleSliderChange(currentSegment, 'end', e.target.value)}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Segment Duration</label>
                                <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-md">
                                    {Math.floor(segments[currentSegment].end - segments[currentSegment].start)} seconds
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    value={segments[currentSegment].description}
                                    onChange={(e) => updateSegment(currentSegment, { description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-8 p-4 border border-gray-200 rounded-lg">
                <h3 className="text-lg font-medium mb-4">Transcript</h3>
                <div className="max-h-96 overflow-y-auto bg-gray-50 p-4 rounded-md text-sm whitespace-pre-wrap">
                    {transcriptionResult?.segments ? renderTranscriptWithTimestamps : formattedTranscript}
                </div>
            </div>

            <div className="flex flex-col space-y-4 mb-4">
                {validationError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm flex items-start">
                        <svg className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>{validationError}</span>
                    </div>
                )}

                <div className="flex justify-between">
                    <button
                        onClick={onStartOver}
                        className="py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 flex items-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove Video
                    </button>

                    <button
                        onClick={() => onApproveSegments(segments)}
                        disabled={!isValid || segments.length === 0}
                        className="py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
                    >
                        Create Videos from {segments.length} Segments
                    </button>
                </div>
            </div>
        </div>
    );
} 