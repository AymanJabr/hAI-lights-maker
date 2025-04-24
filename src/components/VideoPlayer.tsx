import { useRef, useEffect, useState } from 'react';
import { VideoSegment } from '@/types';

interface VideoPlayerProps {
    src: string;
    segments?: VideoSegment[];
    onSegmentClick?: (segment: VideoSegment) => void;
    autoPlay?: boolean;
}

export default function VideoPlayer({ src, segments = [], onSegmentClick, autoPlay = false }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
        };

        const handleLoadedMetadata = () => {
            setDuration(video.duration);
        };

        const handlePlay = () => {
            setIsPlaying(true);
        };

        const handlePause = () => {
            setIsPlaying(false);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, []);

    const togglePlayPause = () => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    };

    const seekTo = (time: number) => {
        const video = videoRef.current;
        if (!video) return;

        video.currentTime = time;
        if (!isPlaying) {
            video.play();
        }
    };

    const formatTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const mm = date.getUTCMinutes();
        const ss = date.getUTCSeconds();
        return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    };

    return (
        <div className="w-full">
            <div className="relative rounded-lg overflow-hidden" ref={containerRef}>
                <video
                    ref={videoRef}
                    src={src}
                    className="w-full h-auto"
                    controls={false}
                    autoPlay={autoPlay}
                    controlsList="nodownload"
                    onClick={togglePlayPause}
                />

                <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/70 to-transparent">
                    {/* Progress bar */}
                    <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden mb-2">
                        <div
                            className="h-full bg-blue-500 relative transition-all duration-100"
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                        >
                            {/* Render segment markers */}
                            {segments.map((segment, index) => (
                                <div
                                    key={index}
                                    className="absolute h-3 w-1 bg-yellow-300 top-1/2 -translate-y-1/2 rounded-sm cursor-pointer"
                                    style={{
                                        left: `${(segment.start / duration) * 100}%`,
                                        width: `${((segment.end - segment.start) / duration) * 100}%`,
                                        minWidth: '4px'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        seekTo(segment.start);
                                        onSegmentClick?.(segment);
                                    }}
                                    title={segment.description || `Segment ${index + 1}`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-between">
                        <button
                            className="text-white p-2 rounded-full hover:bg-white/10 transition"
                            onClick={togglePlayPause}
                        >
                            {isPlaying ? (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            )}
                        </button>

                        <div className="text-white text-sm">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Segments list */}
            {segments.length > 0 && (
                <div className="mt-4 space-y-2">
                    <h3 className="text-lg font-medium text-gray-800">Highlight Segments</h3>
                    <div className="space-y-2">
                        {segments.map((segment, index) => (
                            <div
                                key={index}
                                className="p-3 bg-gray-100 rounded-lg flex items-center justify-between hover:bg-gray-200 cursor-pointer"
                                onClick={() => {
                                    seekTo(segment.start);
                                    onSegmentClick?.(segment);
                                }}
                            >
                                <div>
                                    <div className="font-medium">Segment {index + 1}</div>
                                    {segment.description && (
                                        <div className="text-sm text-gray-600">{segment.description}</div>
                                    )}
                                </div>
                                <div className="text-sm text-gray-500">
                                    {formatTime(segment.start)} - {formatTime(segment.end)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
} 