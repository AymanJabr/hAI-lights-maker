import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
    try {
        // Get API key from header
        const apiKey = request.headers.get('X-API-KEY');

        if (!apiKey) {
            return NextResponse.json(
                { error: 'OpenAI API key is required' },
                { status: 401 }
            );
        }

        // Basic validation of API key format
        if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
            return NextResponse.json(
                { error: 'Invalid API key format' },
                { status: 401 }
            );
        }

        const openai = new OpenAI({ apiKey });

        // Get form data with audio file
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json(
                { error: 'Audio file is required' },
                { status: 400 }
            );
        }

        // Convert File to Blob for OpenAI API
        const buffer = await file.arrayBuffer();
        const fileBlob = new Blob([buffer]);

        // Create a form for API call
        const openAIFormData = new FormData();
        openAIFormData.append('file', fileBlob, file.name);
        openAIFormData.append('model', 'whisper-1');
        openAIFormData.append('response_format', 'verbose_json');
        openAIFormData.append('timestamp_granularities[]', 'segment');

        // Call OpenAI's transcription API
        const transcription = await openai.audio.transcriptions.create({
            file: fileBlob as any, // Type workaround
            model: 'whisper-1',
            response_format: 'verbose_json',
            timestamp_granularities: ['segment'],
        });

        return NextResponse.json(transcription);
    } catch (error) {
        console.error('Transcription error:', error);
        // Check if it's an OpenAI API error
        const errorMessage = error instanceof Error
            ? error.message
            : 'Unknown error during transcription';

        // Return a more detailed error message
        return NextResponse.json(
            {
                error: errorMessage,
                details: error instanceof Error ? error.cause || error.stack : undefined
            },
            { status: error instanceof Error && errorMessage.includes('401') ? 401 : 500 }
        );
    }
}

// Increase payload size limit for audio files
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
}; 