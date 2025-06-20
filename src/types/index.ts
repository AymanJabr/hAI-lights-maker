export interface VideoSegment {
    start: number;
    end: number;
    description?: string;
    confidence?: number;
    status?: 'suggested' | 'approved' | 'rejected';
    targetPlatform?: 'youtube' | 'tiktok' | 'instagram' | 'original';
}

export interface HighlightConfig {
    mode: 'highlights' | 'epic' | 'main-ideas' | 'funny' | 'custom';
    customPrompt?: string;
    maxDuration?: number;
    targetPlatform: 'youtube' | 'tiktok' | 'instagram' | 'original';
}

export interface ProcessedVideo {
    id: string;
    originalFile: File | null;
    segments: VideoSegment[];
    transcript?: string;
    highlightConfig: HighlightConfig;
    outputUrl?: string;
    outputUrls?: Record<string, string>;
    status?: 'suggested' | 'approved';
}

export interface VideoMetadata {
    duration: number;
    width: number;
    height: number;
    fps: number;
    format?: string;
}

export interface TranscriptionResult {
    text: string;
    segments?: {
        id: number;
        start: number;
        end: number;
        text: string;
    }[];
}

export type ProgressStatus = 'idle' | 'uploading' | 'transcribing' | 'analyzing' | 'reviewing' | 'processing' | 'generating' | 'completed' | 'error';

export interface ProgressState {
    status: ProgressStatus;
    progress: number;
    message?: string;
    error?: string;
}

export interface FaceDetectionResult {
    timeStamp: number;
    confidence: number;
    boundingBox: {
        xMin: number;
        yMin: number;
        width: number;
        height: number;
    };
}

export interface ApiKeyConfig {
    apiKey: string
} 