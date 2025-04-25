import { useState } from 'react';
import { VideoSegment } from '@/types';
import SegmentPreview from './SegmentPreview';
import SegmentModal from './SegmentModal';

interface SegmentsGalleryProps {
    segments: VideoSegment[];
    originalVideo: File;
}

export default function SegmentsGallery({ segments, originalVideo }: SegmentsGalleryProps) {
    const [activeSegment, setActiveSegment] = useState<{
        segment: VideoSegment;
        index: number;
        url: string;
    } | null>(null);

    const handleMaximize = (segment: VideoSegment, index: number, url: string) => {
        setActiveSegment({ segment, index, url });
    };

    const handleCloseModal = () => {
        setActiveSegment(null);
    };

    return (
        <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Individual Segments ({segments.length})</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {segments.map((segment, index) => (
                    <SegmentPreview
                        key={`segment-${index}`}
                        segment={segment}
                        index={index}
                        originalVideo={originalVideo}
                        onMaximize={(segment, url) => handleMaximize(segment, index, url)}
                    />
                ))}
            </div>

            {activeSegment && (
                <SegmentModal
                    segment={activeSegment.segment}
                    index={activeSegment.index}
                    videoUrl={activeSegment.url}
                    onClose={handleCloseModal}
                    onDownload={() => {
                        const a = document.createElement('a');
                        a.href = activeSegment.url;
                        a.download = `segment-${activeSegment.index + 1}.mp4`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    }}
                />
            )}
        </div>
    );
} 