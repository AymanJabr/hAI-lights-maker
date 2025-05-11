import { useState } from 'react';
import { HighlightConfig as HighlightConfigType } from '@/types';

interface HighlightConfigProps {
    onChange: (config: HighlightConfigType) => void;
    initialConfig?: HighlightConfigType;
    disabled?: boolean;
}

export default function HighlightConfig({ onChange, initialConfig, disabled = false }: HighlightConfigProps) {
    const [config, setConfig] = useState<HighlightConfigType>(
        initialConfig || {
            mode: 'highlights',
            targetPlatform: 'youtube',
            customPrompt: '',
        }
    );

    const handleChange = (key: keyof HighlightConfigType, value: any) => {
        const updatedConfig = { ...config, [key]: value };
        setConfig(updatedConfig);
        onChange(updatedConfig);
    };

    const modeOptions = [
        { value: 'highlights', label: 'Key Highlights', description: 'Important and engaging moments' },
        { value: 'epic', label: 'Epic Moments', description: 'Dramatic and exciting clips' },
        { value: 'main-ideas', label: 'Main Ideas', description: 'Key concepts and central points' },
        { value: 'funny', label: 'Funny Moments', description: 'Humorous and entertaining bits' },
        { value: 'custom', label: 'Custom', description: 'Define your own criteria' },
    ];

    const platformOptions = [
        { value: 'youtube', label: 'YouTube (16:9)', description: 'Best for YouTube and standard video' },
        { value: 'tiktok', label: 'TikTok Stories (9:16)', description: 'Vertical format for mobile platforms' },
        { value: 'instagram', label: 'Instagram Reels(1:1)', description: 'Square format for feed posts' },
        { value: 'original', label: 'Original Format', description: 'Preserve original video dimensions' },
    ];

    return (
        <div className="w-full space-y-6">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Highlight Mode
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {modeOptions.map((option) => (
                        <div
                            key={option.value}
                            className={`
                border rounded-lg p-4 cursor-pointer transition
                ${config.mode === option.value
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300'}
                ${disabled ? 'opacity-50 pointer-events-none' : ''}
              `}
                            onClick={() => !disabled && handleChange('mode', option.value)}
                        >
                            <div className="font-medium">{option.label}</div>
                            <div className="text-sm text-gray-500">{option.description}</div>
                        </div>
                    ))}
                </div>
            </div>

            {config.mode === 'custom' && (
                <div>
                    <label htmlFor="customPrompt" className="block text-sm font-medium text-gray-700 mb-1">
                        Custom Prompt
                    </label>
                    <textarea
                        id="customPrompt"
                        rows={3}
                        placeholder="Describe what kind of highlights you want to extract..."
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        value={config.customPrompt}
                        onChange={(e) => handleChange('customPrompt', e.target.value)}
                        disabled={disabled}
                    />
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Platform
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {platformOptions.map((option) => (
                        <div
                            key={option.value}
                            className={`
                border rounded-lg p-4 cursor-pointer transition
                ${config.targetPlatform === option.value
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300'}
                ${disabled ? 'opacity-50 pointer-events-none' : ''}
              `}
                            onClick={() => !disabled && handleChange('targetPlatform', option.value)}
                        >
                            <div className="font-medium">{option.label}</div>
                            <div className="text-sm text-gray-500">{option.description}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
} 