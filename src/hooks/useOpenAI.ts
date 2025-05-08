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

    async function transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
        setIsLoading(true);
        setError(null);

        try {
            if (!apiKey) {
                throw new Error('API key is required');
            }

            console.log(`Preparing to transcribe audio file (${audioBlob.size} bytes)`);

            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.mp3');
            formData.append('model', 'whisper-1');
            formData.append('response_format', 'json');
            formData.append('timestamp_granularities[]', 'segment');

            console.log('Sending transcription request to API');
            const response = await fetch('/api/openai/transcribe', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-API-KEY': apiKey || '',
                },
            });

            if (!response.ok) {
                let errorText = '';
                let isFileSizeError = false;
                let responseStatus = response.status; // Store status before trying to parse body
                try {
                    const errorJson = await response.json();
                    if (responseStatus === 413 && errorJson.error) {
                        errorText = errorJson.error;
                        isFileSizeError = true;
                    } else {
                        errorText = JSON.stringify(errorJson);
                    }
                } catch (e) {
                    errorText = await response.text(); // Fallback if .json() fails
                }
                console.error(`Transcription API error (${responseStatus}):`, errorText);

                const finalErrorMessage = isFileSizeError
                    ? errorText
                    : `Transcription failed: ${responseStatus} ${response.statusText}. ${errorText}`;

                throw new ApiError(finalErrorMessage, responseStatus);
            }

            console.log('Transcription API response received');
            const result = await response.json();

            // Validate the response
            if (!result.text) {
                console.error('Invalid transcription result:', result);
                throw new Error('Invalid transcription result: missing text');
            }

            return result;
        } catch (err) {
            let errorMessage: string;
            let errorStatus: number | undefined = undefined;

            if (err instanceof ApiError) {
                errorMessage = err.message;
                errorStatus = err.status;
            } else if (err instanceof Error) {
                errorMessage = err.message;
            } else {
                errorMessage = 'Unknown error during transcription';
            }

            console.error('Transcription error details:', err);
            // Potentially enrich the global error state if needed, or rely on the component using the hook
            setError(errorMessage); // setError will store the message string
            // Re-throw the original error (or the ApiError) so the calling component can also react, e.g. to status
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
                    maxDuration: config.maxDuration || Math.min(60, videoDuration * 0.2), // Default to 20% of video or 60 seconds
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