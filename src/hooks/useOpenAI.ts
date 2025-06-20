import { useState } from 'react';
import { TranscriptionResult, VideoSegment, HighlightConfig } from '@/types';

// Define a custom error class to include status
export class ApiError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        // Set the prototype explicitly to allow instanceof checks
        Object.setPrototypeOf(this, ApiError.prototype);
    }
}

interface UseOpenAIProps {
    apiKey?: string;
}

export function useOpenAI({ apiKey }: UseOpenAIProps = {}) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function transcribeAudio(audioUrl: string): Promise<TranscriptionResult> {
        setIsLoading(true);
        setError(null);

        try {
            if (!apiKey) {
                throw new Error('API key is required');
            }

            console.log(`Preparing to transcribe audio from URL: ${audioUrl}`);
            return await transcribeFromUrl(audioUrl);

        } catch (err) {
            let errorMessage: string;

            if (err instanceof ApiError) {
                errorMessage = err.message;
            } else if (err instanceof Error) {
                errorMessage = err.message;
            } else {
                errorMessage = 'Unknown error during transcription';
            }

            console.error('Transcription error details:', err);
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }

    // Helper function to transcribe from a URL
    async function transcribeFromUrl(audioUrl: string): Promise<TranscriptionResult> {
        console.log(`Sending transcription request to API for ${audioUrl}`);
        const response = await fetch('/api/openai/transcribe', {
            method: 'POST',
            body: JSON.stringify({ fileUrl: audioUrl }),
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': apiKey || '',
            },
        });

        if (!response.ok) {
            let errorText = '';
            const responseStatus = response.status;
            try {
                const errorJson = await response.json();
                errorText = errorJson.error || JSON.stringify(errorJson);
            } catch (e) {
                errorText = await response.text();
            }
            console.error(`Transcription API error (${responseStatus}):`, errorText);

            const finalErrorMessage = `Transcription failed: ${responseStatus} ${response.statusText}. ${errorText}`;
            throw new ApiError(finalErrorMessage, responseStatus);
        }

        console.log('Transcription API response received');
        const result = await response.json();

        if (!result.text) {
            console.error('Invalid transcription response:', result);
            throw new Error('Transcription succeeded but the response was invalid.');
        }

        return result;
    }

    async function findHighlights(
        transcript: string,
        config: HighlightConfig,
        videoDuration: number
    ): Promise<VideoSegment[]> {
        setIsLoading(true);
        setError(null);

        try {
            if (!apiKey) {
                throw new Error('API key is required');
            }

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
                    videoDuration
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to generate highlights: ${response.statusText}. ${errorText}`);
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