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
    const progressBarRef = useRef<HTMLDivElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isControlsVisible, setIsControlsVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);

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

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(
                !!(document.fullscreenElement ||
                    (document as any).webkitFullscreenElement ||
                    (document as any).mozFullScreenElement ||
                    (document as any).msFullscreenElement)
            );
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
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

    const toggleFullscreen = () => {
        const container = containerRef.current;
        if (!container) return;

        if (!isFullscreen) {
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if ((container as any).webkitRequestFullscreen) {
                (container as any).webkitRequestFullscreen();
            } else if ((container as any).mozRequestFullScreen) {
                (container as any).mozRequestFullScreen();
            } else if ((container as any).msRequestFullscreen) {
                (container as any).msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            } else if ((document as any).mozCancelFullScreen) {
                (document as any).mozCancelFullScreen();
            } else if ((document as any).msExitFullscreen) {
                (document as any).msExitFullscreen();
            }
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

    const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const progressBar = progressBarRef.current;
        if (!progressBar || !videoRef.current) return;

        const rect = progressBar.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        const newTime = clickPosition * duration;

        seekTo(newTime);
    };

    const formatTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const mm = date.getUTCMinutes();
        const ss = date.getUTCSeconds();
        return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    };

    return (
        <div className="w-full h-full">
            <div
                className="relative w-full h-full bg-black rounded-lg overflow-hidden"
                ref={containerRef}
                onMouseEnter={() => setIsControlsVisible(true)}
                onMouseLeave={() => setIsControlsVisible(false)}
            >
                <video
                    ref={videoRef}
                    src={src}
                    className="w-full h-full object-cover"
                    controls={false}
                    autoPlay={autoPlay}
                    controlsList="nodownload"
                    onClick={togglePlayPause}
                />

                {/* Play/Pause Button Overlay */}
                <div
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300"
                    style={{ opacity: isPlaying ? 0 : 0.8 }}
                >
                    <button
                        className="text-white bg-black/50 p-5 rounded-full hover:bg-black/70 transition"
                        onClick={togglePlayPause}
                    >
                        <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </button>
                </div>

                {/* Controls Overlay */}
                <div
                    className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300"
                    style={{ opacity: isControlsVisible || !isPlaying ? 1 : 0 }}
                >
                    {/* Progress bar */}
                    <div
                        ref={progressBarRef}
                        className="w-full h-2 bg-white/30 rounded-full overflow-hidden mb-2 cursor-pointer"
                        onClick={handleProgressBarClick}
                    >
                        <div
                            className="h-full bg-blue-500 relative transition-all duration-100"
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                        >
                            {/* Render segment markers */}
                            {segments.map((segment, index) => (
                                <div
                                    key={index}
                                    className="absolute h-4 w-1 bg-yellow-300 top-1/2 -translate-y-1/2 rounded-sm cursor-pointer"
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

                        <div className="flex items-center space-x-3">
                            <div className="text-white text-sm">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </div>
                            <button
                                className="text-white p-2 rounded-full hover:bg-white/10 transition"
                                onClick={toggleFullscreen}
                                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                            >
                                {isFullscreen ? (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                                    </svg>
                                )}
                            </button>
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