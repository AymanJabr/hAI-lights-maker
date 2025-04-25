import { useRef, useEffect } from 'react';
import { VideoSegment } from '@/types';

interface SegmentModalProps {
    segment: VideoSegment;
    index: number;
    videoUrl: string;
    onClose: () => void;
    onDownload: () => void;
}

export default function SegmentModal({ segment, index, videoUrl, onClose, onDownload }: SegmentModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        // Auto play video when modal opens
        if (videoRef.current) {
            videoRef.current.play().catch(err => {
                console.warn('Failed to autoplay video in modal:', err);
            });
        }

        // Close modal on ESC key
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        // Close modal when clicking outside content
        const handleClickOutside = (e: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEsc);
        document.addEventListener('mousedown', handleClickOutside);

        // Prevent background scrolling
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.removeEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    const formatTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const mm = date.getUTCMinutes();
        const ss = date.getUTCSeconds();
        return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div
                ref={modalRef}
                className="bg-white rounded-lg overflow-hidden shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
            >
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-xl font-medium">
                        Segment {index + 1} - {formatTime(segment.start)} to {formatTime(segment.end)}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full"
                    >
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-hidden bg-black">
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        controls
                        autoPlay
                    />
                </div>

                {segment.description && (
                    <div className="p-4 border-t border-gray-200">
                        <p className="text-gray-800">{segment.description}</p>
                    </div>
                )}

                <div className="p-4 border-t border-gray-200 flex space-x-3">
                    <button
                        onClick={onDownload}
                        className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                    >
                        Download Segment
                    </button>
                    <button
                        onClick={onClose}
                        className="py-3 px-4 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
} 