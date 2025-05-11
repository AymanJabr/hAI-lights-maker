import { useState } from 'react';
import { ProcessedVideo, ProgressState, VideoSegment } from '@/types';
import SegmentsGallery from './SegmentsGallery';
import VideoPlayer from './VideoPlayer';
import { useSegmentsCompletionStatus } from '@/hooks/useSegmentsCompletionStatus';

interface ResultsSectionProps {
    processedVideo: ProcessedVideo;
    videoUrl: string;
    onStartOver: () => void;
    highlightUrls: Record<string, string>;
    progress: ProgressState;
    onCombineSegments: () => void;
}

export default function ResultsSection({
    processedVideo,
    videoUrl,
    onStartOver,
    highlightUrls,
    progress,
    onCombineSegments
}: ResultsSectionProps) {
    // Use string comparison for status checking
    const isProcessing = progress.status === 'processing';

    // Track if all segments are ready
    const areSegmentsReady = useSegmentsCompletionStatus();

    return (
        <div className="w-full">
            <h2 className="text-2xl font-bold mb-6">Your Highlights</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                <div>
                    <h3 className="text-lg font-medium mb-2">Original Video</h3>
                    <div className="mb-6">
                        <VideoPlayer src={videoUrl} />
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-medium mb-2">Highlight Details</h3>
                    <div className="border border-gray-200 rounded-lg p-4">
                        <div className="mb-4">
                            <h4 className="font-medium text-gray-700">Segments Found</h4>
                            <p className="text-gray-600">
                                {processedVideo.segments.length} segments, {Math.floor(
                                    processedVideo.segments.reduce((acc: number, segment: VideoSegment) => acc + (segment.end - segment.start), 0)
                                )} seconds total
                            </p>
                        </div>

                        <div className="mb-4">
                            <h4 className="font-medium text-gray-700">Highlight Style</h4>
                            <p className="text-gray-600 capitalize">{processedVideo.highlightConfig.mode}</p>
                        </div>

                        <div className="mt-6">
                            <button
                                onClick={onStartOver}
                                className="w-full py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Start Over
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Segments Gallery */}
            {processedVideo.originalFile && (
                <SegmentsGallery
                    segments={processedVideo.segments}
                    originalVideo={processedVideo.originalFile}
                />
            )}

            {/* Combined Highlight Video Section */}
            <div className="mt-10 mb-6">
                <h2 className="text-xl font-bold mb-6">Generated Highlight Video</h2>
                {Object.keys(highlightUrls).length > 0 ? (
                    <div>
                        <div className="mb-6">
                            <div className="border border-gray-200 rounded-lg p-4">
                                <h3 className="text-lg font-medium mb-2">
                                    {processedVideo.highlightConfig?.targetPlatform === 'original'
                                        ? 'Original Format Highlight'
                                        : `${processedVideo.highlightConfig?.targetPlatform?.charAt(0).toUpperCase()}${processedVideo.highlightConfig?.targetPlatform?.slice(1)} Format Highlight`}
                                </h3>
                                <VideoPlayer
                                    src={Object.values(highlightUrls)[0]}
                                    segments={processedVideo.segments}
                                    autoPlay={false}
                                    platformFormat={processedVideo.highlightConfig?.targetPlatform}
                                />
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {Object.entries(highlightUrls).map(([format, url]) => (
                                        <a
                                            key={format}
                                            href={url}
                                            download={`highlight-${format}.mp4`}
                                            className="inline-block py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                        >
                                            Download {format.charAt(0).toUpperCase() + format.slice(1)} Highlight
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : isProcessing ? (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center">
                        <svg className="animate-spin h-5 w-5 text-blue-600 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-blue-700">Generating highlight video... {Math.round(progress.progress)}%</span>
                    </div>
                ) : (
                    <div className="p-4 bg-white border border-gray-200 rounded-lg">
                        <h3 className="text-lg font-medium mb-2">Create a Highlight Video</h3>
                        <p className="text-gray-600 mb-4">
                            Now you can generate a highlight video in your selected format. This may take a few moments to process.
                        </p>
                        <button
                            onClick={onCombineSegments}
                            disabled={isProcessing || !areSegmentsReady}
                            className="py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                        >
                            {isProcessing ? 'Processing...' : !areSegmentsReady ? 'Waiting for segments to process...' : 'Generate Highlight Video'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
} 