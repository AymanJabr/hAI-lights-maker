import { useState, useEffect } from 'react';
import { VideoSegment } from '@/types';
import SegmentPreview, { resetSegmentCounts } from './SegmentPreview';

interface SegmentsGalleryProps {
    segments: VideoSegment[];
    originalVideo: File;
}

// Declare global window properties if not already declared
declare global {
    interface Window {
        _totalSegmentsCount?: number;
    }
}

// Create a delay between when segments are displayed and when they start processing
// This helps prevent resource contention with the main video processing
let segmentsProcessingDelay = 1000; // Reduced to 1 second for better user experience

export default function SegmentsGallery({ segments, originalVideo }: SegmentsGalleryProps) {
    const [processSegments, setProcessSegments] = useState(false);

    // Update the total segments count
    useEffect(() => {
        // Reset counters when mounting a new gallery
        resetSegmentCounts();

        // Set the new total count
        if (typeof window !== 'undefined') {
            window._totalSegmentsCount = segments.length;
        }

        return () => {
            // Reset on unmount
            resetSegmentCounts();
        };
    }, [segments.length]);

    // Delay segment processing to avoid conflicts with main video creation
    useEffect(() => {
        // Start processing segments right away since we've separated the combined video process
        const timer = setTimeout(() => {
            console.log('Starting individual segment processing');
            setProcessSegments(true);
        }, segmentsProcessingDelay);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Individual Segments ({segments.length})</h2>
                <div className="text-sm text-gray-500">
                    {!processSegments ?
                        "Preparing segments..." :
                        "Processing segments in sequence"}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {segments.map((segment, index) => (
                    <SegmentPreview
                        key={`segment-${index}`}
                        segment={segment}
                        index={index}
                        originalVideo={originalVideo}
                        ready={processSegments}
                    />
                ))}
            </div>
        </div>
    );
} 