import { useState } from 'react';
import { VideoMetadata, ProgressState } from '@/types';
import VideoUploader from '@/components/VideoUploader';
import { getVideoMetadata } from '@/lib/utils/video-utils';

const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5 GiB
const MAX_FILE_SIZE_GB = MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024);

// Basic Modal Component for this section
interface FileSizeErrorModalProps {
    isOpen: boolean;
    message: string;
    onClose: () => void;
}
const FileSizeErrorModal: React.FC<FileSizeErrorModalProps> = ({ isOpen, message, onClose }) => {
    if (!isOpen) return null;
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}> {/* Higher z-index if needed */}
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', color: 'black', textAlign: 'center' }}>
                <h3 style={{ color: 'red', marginBottom: '10px' }}>Upload Error</h3>
                <p>{message}</p>
                <button onClick={onClose} style={{ marginTop: '15px', padding: '8px 16px' }}>OK</button>
            </div>
        </div>
    );
};

interface VideoUploadSectionProps {
    onVideoSelected: (file: File, url: string, metadata: VideoMetadata) => void;
    progress: ProgressState;
}

export default function VideoUploadSection({ onVideoSelected, progress }: VideoUploadSectionProps) {
    const [showSizeErrorModal, setShowSizeErrorModal] = useState(false);
    const [sizeErrorMessage, setSizeErrorMessage] = useState('');

    const handleVideoSelected = async (file: File) => {
        // Client-side file size check
        if (file.size > MAX_FILE_SIZE_BYTES) {
            setSizeErrorMessage(`Error: File size (${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB) exceeds the ${MAX_FILE_SIZE_GB}GB limit.`);
            setShowSizeErrorModal(true);
            // It would be ideal to reset the file input in VideoUploader here, 
            // but VideoUploadSection doesn't have direct access to it.
            // The user will need to re-select a valid file.
            return; // Stop processing this file
        }

        try {
            console.log('Video file selected:', file.name, 'Size:', (file.size / (1024 * 1024)).toFixed(2) + 'MB', 'Type:', file.type);

            // Create a custom function to update progress
            const updateProgress = (status: ProgressState['status'], progressValue: number, message?: string) => {
                console.log(`Progress Update: ${status} - ${progressValue}% - ${message || ''}`);
                // Assuming `progress` prop is an object managed by parent, so this internal updateProgress might just be for logging.
                // If VideoUploadSection is supposed to call a prop to update global progress, that should be used.
            };

            updateProgress('uploading', 0, 'Starting upload process...');

            // Create object URL for the video
            const url = URL.createObjectURL(file);
            console.log('Video URL created for preview:', url);

            // Get video metadata
            try {
                updateProgress('uploading', 30, 'Analyzing video metadata...');
                console.log('Getting video metadata...');
                const metadata = await getVideoMetadata(file);
                console.log('Video metadata retrieved successfully:', metadata);
                updateProgress('idle', 100, 'Video ready for processing');

                // Pass everything back to parent
                onVideoSelected(file, url, metadata);
            } catch (metadataError) {
                console.error('Error getting video metadata:', metadataError);

                // Attempt to get basic metadata through a fallback approach
                updateProgress('uploading', 40, 'Using fallback method for video analysis...');

                // Create a simple video element to try to get basic metadata
                const video = document.createElement('video');
                video.muted = true;

                // Create new object URL
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
                            URL.revokeObjectURL(newUrl);
                            resolve();

                            // Pass back to parent
                            onVideoSelected(file, url, fallbackMetadata);
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
                    updateProgress('idle', 100, 'Video ready for processing (using estimated metadata)');

                    // Pass back to parent with default metadata
                    onVideoSelected(file, url, defaultMetadata);
                }
            }
        } catch (err) {
            console.error('Error during video upload:', err);
            // If this component had an onError prop, we might call it here for other types of errors.
            // For file size error, it's handled by the modal directly.
            // For other errors, they might propagate up or be caught by parent's try/catch if handleVideoSelected is awaited.
        }
    };

    const closeSizeErrorModal = () => {
        setShowSizeErrorModal(false);
        setSizeErrorMessage('');
    };

    return (
        <div className="max-w-2xl mx-auto w-full">
            <h2 className="text-2xl font-bold mb-6">Upload Your Video</h2>
            <VideoUploader
                onVideoSelected={handleVideoSelected}
                isProcessing={progress.status !== 'idle'}
                progress={progress}
            />
            <FileSizeErrorModal
                isOpen={showSizeErrorModal}
                message={sizeErrorMessage}
                onClose={closeSizeErrorModal}
            />
        </div>
    );
} 