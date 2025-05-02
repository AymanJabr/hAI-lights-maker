import { useState, useRef, useEffect } from 'react';
import { ProgressState } from '@/types';
import { getMaxVideoSize, formatFileSize } from '@/lib/utils/device-utils';
import VideoSizeWarningModal from './VideoSizeWarningModal';

interface VideoUploaderProps {
    onVideoSelected: (file: File) => void;
    isProcessing: boolean;
    progress: ProgressState;
}

export default function VideoUploader({ onVideoSelected, isProcessing, progress }: VideoUploaderProps) {
    const [dragActive, setDragActive] = useState(false);
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [maxVideoSize, setMaxVideoSize] = useState<number>(100 * 1024 * 1024); // Default 100MB
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Set max video size based on device capabilities when component mounts
    useEffect(() => {
        // Only run on client side
        if (typeof window !== 'undefined') {
            setMaxVideoSize(getMaxVideoSize());
        }
    }, []);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const processVideoFile = (file: File) => {
        if (isVideoFile(file)) {
            setSelectedFile(file);

            // Check if file size exceeds recommended maximum
            if (file.size > maxVideoSize) {
                console.log(`Large file detected: ${formatFileSize(file.size)}, recommended max: ${formatFileSize(maxVideoSize)}`);
                setShowWarningModal(true);
            } else {
                // Proceed with normal upload
                onVideoSelected(file);
            }
        } else {
            alert('Please upload a valid video file.');
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            processVideoFile(file);
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            processVideoFile(file);
        }
    };

    const isVideoFile = (file: File) => {
        return file.type.startsWith('video/');
    };

    const handleWarningConfirm = () => {
        setShowWarningModal(false);
        if (selectedFile) {
            onVideoSelected(selectedFile);
        }
    };

    const handleWarningClose = () => {
        setShowWarningModal(false);
        setSelectedFile(null);
        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div
                className={`
          border-2 border-dashed rounded-lg p-12 text-center
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}
        `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={isProcessing ? undefined : handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInput}
                    accept="video/*"
                    disabled={isProcessing}
                    className="hidden"
                />
                <div className="flex flex-col items-center justify-center">
                    <svg
                        className="w-16 h-16 mb-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                    </svg>
                    <p className="text-lg font-medium text-gray-700">
                        {isProcessing ? 'Processing video...' : 'Drag & drop your video here or click to browse'}
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                        Supports MP4, WebM, MOV, and AVI formats (recommended max: {formatFileSize(maxVideoSize)})
                    </p>
                </div>
            </div>

            {isProcessing && (
                <div className="mt-6">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                        {progress.message || `${progress.status.charAt(0).toUpperCase() + progress.status.slice(1)}...`}
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-200"
                            style={{ width: `${progress.progress}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 text-right">
                        {progress.progress.toFixed(0)}%
                    </p>
                </div>
            )}

            {progress.error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{progress.error}</p>
                </div>
            )}

            {/* Warning Modal */}
            {selectedFile && (
                <VideoSizeWarningModal
                    isOpen={showWarningModal}
                    onClose={handleWarningClose}
                    onConfirm={handleWarningConfirm}
                    fileSize={selectedFile.size}
                    maxRecommendedSize={maxVideoSize}
                />
            )}
        </div>
    );
} 