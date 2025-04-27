import { HighlightConfig, VideoMetadata, ProgressState } from '@/types';
import HighlightConfigComponent from '@/components/HighlightConfig';
import VideoPlayer from '@/components/VideoPlayer';

interface ConfigurationSectionProps {
    videoUrl: string;
    videoMetadata: VideoMetadata | null;
    highlightConfig: HighlightConfig;
    onConfigChange: (config: HighlightConfig) => void;
    onGenerateSegments: () => void;
    progress: ProgressState;
    isLoading: boolean;
    openAIError: string | null;
}

export default function ConfigurationSection({
    videoUrl,
    videoMetadata,
    highlightConfig,
    onConfigChange,
    onGenerateSegments,
    progress,
    isLoading,
    openAIError
}: ConfigurationSectionProps) {
    return (
        <div className="w-full">
            <h2 className="text-2xl font-bold mb-6">Configure Highlight Settings</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <div className="mb-6">
                        <h3 className="text-lg font-medium mb-2">Preview</h3>
                        <VideoPlayer src={videoUrl} />
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                        <h4 className="font-medium text-blue-800">Video Information</h4>
                        {videoMetadata && (
                            <div className="mt-2 text-sm text-blue-700">
                                <p>Duration: {Math.floor(videoMetadata.duration / 60)}m {Math.floor(videoMetadata.duration % 60)}s</p>
                                <p>Resolution: {videoMetadata.width}x{videoMetadata.height}</p>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-medium mb-2">Highlight Settings</h3>
                    <HighlightConfigComponent
                        onChange={onConfigChange}
                        initialConfig={highlightConfig}
                        disabled={progress.status !== 'idle'}
                    />

                    <div className="mt-6">
                        <button
                            onClick={onGenerateSegments}
                            disabled={progress.status !== 'idle' || isLoading}
                            className={`w-full py-3 px-4 rounded-md text-white font-medium
                ${progress.status !== 'idle' || isLoading
                                    ? 'bg-blue-300 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 transition-colors'}
              `}
                        >
                            {isLoading || progress.status !== 'idle'
                                ? 'Processing...'
                                : 'Generate Segments'}
                        </button>

                        {openAIError && (
                            <p className="mt-2 text-sm text-red-600">{openAIError}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
} 