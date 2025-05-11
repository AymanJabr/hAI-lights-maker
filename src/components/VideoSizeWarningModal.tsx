import { formatFileSize, estimateProcessingTime } from '@/lib/utils/device-utils';

interface VideoSizeWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    fileSize: number;
    maxRecommendedSize: number;
}

export default function VideoSizeWarningModal({
    isOpen,
    onClose,
    onConfirm,
    fileSize,
    maxRecommendedSize,
}: VideoSizeWarningModalProps) {
    if (!isOpen) return null;

    const formattedFileSize = formatFileSize(fileSize);
    const formattedMaxSize = formatFileSize(maxRecommendedSize);
    const estimatedTime = estimateProcessingTime(fileSize);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800 bg-opacity-75">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
                <div className="flex items-center text-amber-600 mb-4">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                    <h3 className="text-xl font-semibold">Large Video Warning</h3>
                </div>

                <div className="mb-6 text-gray-700">
                    <p className="mb-3">
                        The video you&apos;ve selected is <span className="font-bold">{formattedFileSize}</span>, which exceeds the
                        recommended maximum of <span className="font-bold">{formattedMaxSize}</span> for your device.
                    </p>
                    <p className="mb-3">
                        Processing this video may:
                    </p>
                    <ul className="list-disc pl-5 mb-3 space-y-1">
                        <li>Take approximately <span className="font-semibold">{estimatedTime} minutes</span> to complete</li>
                        <li>Cause your browser to run slowly or become unresponsive</li>
                        <li>Use significant system resources</li>
                    </ul>
                    <p>
                        Consider selecting a smaller video or trimming this one before uploading.
                    </p>
                </div>

                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                        Choose Another
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
                    >
                        Continue Anyway
                    </button>
                </div>
            </div>
        </div>
    );
} 