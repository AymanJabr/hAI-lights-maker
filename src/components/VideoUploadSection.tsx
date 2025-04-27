import { useState } from 'react';
import { VideoMetadata, ProgressState } from '@/types';
import VideoUploader from '@/components/VideoUploader';
import { getVideoMetadata } from '@/lib/utils/video-utils';

interface VideoUploadSectionProps {
    onVideoSelected: (file: File, url: string, metadata: VideoMetadata) => void;
    progress: ProgressState;
}

export default function VideoUploadSection({ onVideoSelected, progress }: VideoUploadSectionProps) {
    const handleVideoSelected = async (file: File) => {
        try {
            console.log('Video file selected:', file.name, 'Size:', (file.size / (1024 * 1024)).toFixed(2) + 'MB', 'Type:', file.type);

            // Create a custom function to update progress
            const updateProgress = (status: ProgressState['status'], progress: number, message?: string) => {
                console.log(`Progress Update: ${status} - ${progress}% - ${message || ''}`);
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
            throw err;
        }
    };

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