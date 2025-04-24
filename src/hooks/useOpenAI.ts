import { useState } from 'react';
import { TranscriptionResult, VideoSegment, HighlightConfig } from '@/types';

interface UseOpenAIProps {
    apiKey?: string;
}

export function useOpenAI({ apiKey }: UseOpenAIProps = {}) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
        setIsLoading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.mp3');
            formData.append('model', 'whisper-1');
            formData.append('response_format', 'json');
            formData.append('timestamp_granularities[]', 'segment');

            const response = await fetch('/api/openai/transcribe', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-API-KEY': apiKey || '',
                },
            });

            if (!response.ok) {
                throw new Error(`Transcription failed: ${response.statusText}`);
            }

            const result = await response.json();
            return result;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error during transcription';
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }

    async function findHighlights(
        transcript: string,
        config: HighlightConfig,
        videoDuration: number
    ): Promise<VideoSegment[]> {
        setIsLoading(true);
        setError(null);

        try {
            const promptMode = config.mode === 'custom'
                ? config.customPrompt
                : getPromptForMode(config.mode);

            const response = await fetch('/api/openai/highlights', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': apiKey || '',
                },
                body: JSON.stringify({
                    transcript,
                    prompt: promptMode,
                    maxDuration: config.maxDuration || Math.min(60, videoDuration * 0.2), // Default to 20% of video or 60 seconds
                    videoDuration
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to generate highlights: ${response.statusText}`);
            }

            const highlightSegments = await response.json();
            return highlightSegments;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error finding highlights';
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }

    function getPromptForMode(mode: HighlightConfig['mode']): string {
        switch (mode) {
            case 'highlights':
                return 'Find the most important and engaging moments in this video that capture key information or action.';
            case 'epic':
                return 'Find the most dramatic, exciting, and impactful moments that would create an epic highlight reel.';
            case 'main-ideas':
                return 'Identify the main ideas, key concepts, and central points discussed in this video.';
            case 'funny':
                return 'Find the most humorous, entertaining, and light-hearted moments in this video.';
            default:
                return 'Find the most important and engaging moments in this video.';
        }
    }

    return {
        transcribeAudio,
        findHighlights,
        isLoading,
        error,
    };
} 