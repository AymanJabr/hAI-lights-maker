import { useRef, useEffect, useState, forwardRef, ForwardedRef } from 'react';
import { VideoSegment } from '@/types';

interface VideoPlayerProps {
    src: string;
    segments?: VideoSegment[];
    onSegmentClick?: (segment: VideoSegment) => void;
    onDirectInteraction?: () => void;
    autoPlay?: boolean;
    id?: string;
    platformFormat?: 'youtube' | 'tiktok' | 'instagram' | 'original';
}

const VideoPlayer = forwardRef(function VideoPlayer(
    { src, segments = [], onSegmentClick, onDirectInteraction, autoPlay = false, id, platformFormat = 'original' }: VideoPlayerProps,
    ref: ForwardedRef<HTMLVideoElement>
) {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isControlsVisible, setIsControlsVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isVolumeControlVisible, setIsVolumeControlVisible] = useState(false);
    const volumeControlRef = useRef<HTMLDivElement>(null);

    // Use either the forwarded ref or the local ref
    const videoRef = (ref as React.RefObject<HTMLVideoElement>) || localVideoRef;

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
        };

        const handleLoadedMetadata = () => {
            setDuration(video.duration);
            // Log video dimensions and aspect ratio when metadata is loaded
            console.log(`Video loaded - Original dimensions: ${video.videoWidth}x${video.videoHeight}`);
            console.log(`Using platform format: ${platformFormat}, container class: ${getAspectRatioClass()}`);
        };

        const handlePlay = () => {
            setIsPlaying(true);
        };

        const handlePause = () => {
            setIsPlaying(false);
        };

        const handleVolumeChange = () => {
            setVolume(video.volume);
            setIsMuted(video.muted);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('volumechange', handleVolumeChange);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('volumechange', handleVolumeChange);
        };
    }, [videoRef]);

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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isVolumeControlVisible &&
                volumeControlRef.current &&
                !volumeControlRef.current.contains(event.target as Node)) {
                setIsVolumeControlVisible(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isVolumeControlVisible]);

    const togglePlayPause = () => {
        const video = videoRef.current;
        if (!video) return;

        // Signal direct user interaction
        onDirectInteraction?.();

        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }

        // Close volume control if it's open
        if (isVolumeControlVisible) {
            setIsVolumeControlVisible(false);
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

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;

        video.muted = !video.muted;
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const video = videoRef.current;
        if (!video) return;

        const newVolume = parseFloat(e.target.value);
        video.volume = newVolume;

        if (newVolume === 0) {
            video.muted = true;
        } else if (video.muted) {
            video.muted = false;
        }
    };

    const seekTo = (time: number) => {
        const video = videoRef.current;
        if (!video) return;

        video.currentTime = time;
    };

    const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const progressBar = progressBarRef.current;
        if (!progressBar || !videoRef.current) return;

        // Signal direct user interaction
        onDirectInteraction?.();

        const rect = progressBar.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        const newTime = clickPosition * duration;

        // This will trigger the seeking event
        videoRef.current.currentTime = newTime;

        // Resume playback if it was already playing
        if (isPlaying) {
            videoRef.current.play();
        }
    };

    const formatTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const mm = date.getUTCMinutes();
        const ss = date.getUTCSeconds();
        return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    };

    // Set the aspect ratio based on platform format
    const getAspectRatioClass = () => {
        switch (platformFormat) {
            case 'youtube':
                return 'aspect-video'; // 16:9
            case 'tiktok':
                return 'aspect-[9/16]'; // 9:16
            case 'instagram':
                return 'aspect-square'; // 1:1
            case 'original':
            default:
                return 'aspect-auto'; // Original aspect ratio
        }
    };

    return (
        <div className="w-full h-full">
            <div
                className={`relative w-full ${getAspectRatioClass()} bg-black rounded-lg overflow-hidden flex items-center justify-center`}
                ref={containerRef}
                onMouseEnter={() => setIsControlsVisible(true)}
                onMouseLeave={() => setIsControlsVisible(false)}
            >
                <video
                    ref={ref as React.RefObject<HTMLVideoElement> || localVideoRef}
                    src={src}
                    className="max-w-full max-h-full object-contain mx-auto"
                    controls={false}
                    autoPlay={autoPlay}
                    controlsList="nodownload"
                    onClick={togglePlayPause}
                    id={id}
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
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
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

                            {/* Volume Control */}
                            <div className="flex items-center relative">
                                <button
                                    className="text-white p-2 rounded-full hover:bg-white/10 transition"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsVolumeControlVisible(!isVolumeControlVisible);
                                    }}
                                >
                                    {isMuted || volume === 0 ? (
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                                        </svg>
                                    ) : volume < 0.5 ? (
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M7 9v6h4l5 5V4l-5 5H7z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                        </svg>
                                    )}
                                </button>

                                {isVolumeControlVisible && (
                                    <div
                                        ref={volumeControlRef}
                                        className="absolute bottom-10 left-0 bg-black/80 p-3 rounded-lg z-10"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex flex-col space-y-2">
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.01"
                                                value={isMuted ? 0 : volume}
                                                className="w-24 h-2 accent-blue-500"
                                                onChange={handleVolumeChange}
                                            />
                                            <button
                                                className="text-white text-xs flex items-center justify-center"
                                                onClick={toggleMute}
                                            >
                                                {isMuted ? "Unmute" : "Mute"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

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

            {/* Segments list - hidden in this context */}
            {segments.length > 0 && false && (
                <div className="mt-4 space-y-2">
                    <h3 className="text-lg font-medium text-gray-800">Highlight Segments</h3>
                    <div className="space-y-2">
                        {segments.map((segment, index) => (
                            <div
                                key={index}
                                className="p-3 bg-gray-100 rounded-lg flex items-center justify-between hover:bg-gray-200 cursor-pointer"
                                onClick={() => {
                                    // Simply seek to start position without starting playback
                                    videoRef.current!.currentTime = segment.start;
                                    // Don't call onDirectInteraction here - this is segment interaction
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
});

export default VideoPlayer; 