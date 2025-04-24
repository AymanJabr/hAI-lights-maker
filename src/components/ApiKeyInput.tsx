import { useState, useEffect } from 'react';

interface ApiKeyInputProps {
    onApiKeyChange: (apiKey: string) => void;
}

export default function ApiKeyInput({ onApiKeyChange }: ApiKeyInputProps) {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    // Load saved API key from localStorage on component mount
    useEffect(() => {
        const savedKey = localStorage.getItem('openai_api_key');
        if (savedKey) {
            setApiKey(savedKey);
            onApiKeyChange(savedKey);
            setIsSaved(true);
        }
    }, [onApiKeyChange]);

    const handleSaveKey = () => {
        if (apiKey.trim()) {
            localStorage.setItem('openai_api_key', apiKey);
            onApiKeyChange(apiKey);
            setIsSaved(true);
        }
    };

    const handleClearKey = () => {
        localStorage.removeItem('openai_api_key');
        setApiKey('');
        onApiKeyChange('');
        setIsSaved(false);
        setShowKey(false);
    };

    return (
        <div className="w-full p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-medium text-gray-800 mb-3">OpenAI API Key</h3>
            <p className="text-sm text-gray-600 mb-4">
                This app uses OpenAI API to generate transcripts and find highlights in your videos.
                Your API key is stored locally in your browser and never sent to our servers.
            </p>

            <div className="flex space-x-2">
                <div className="relative flex-grow">
                    <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => {
                            setApiKey(e.target.value);
                            setIsSaved(false);
                        }}
                        placeholder="sk-..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        onClick={() => setShowKey(!showKey)}
                    >
                        {showKey ? (
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                        ) : (
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        )}
                    </button>
                </div>

                {isSaved ? (
                    <button
                        type="button"
                        onClick={handleClearKey}
                        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Clear
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleSaveKey}
                        disabled={!apiKey.trim()}
                        className={`px-4 py-2 rounded-md shadow-sm text-sm font-medium text-white ${!apiKey.trim() ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                            }`}
                    >
                        Save
                    </button>
                )}
            </div>

            {isSaved && (
                <p className="mt-2 text-sm text-green-600">
                    API key saved successfully!
                </p>
            )}

            <p className="mt-4 text-xs text-gray-500">
                Don't have an API key?{' '}
                <a
                    href="https://platform.openai.com/account/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                >
                    Get one from OpenAI
                </a>
            </p>
        </div>
    );
} 