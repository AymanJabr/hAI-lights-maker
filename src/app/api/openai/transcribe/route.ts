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

        // Get form data with audio file
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json(
                { error: 'Audio file is required' },
                { status: 400 }
            );
        }

        console.log('Received file:', file.name, 'Size:', file.size, 'Type:', file.type);

        // Create a new FormData instance to send to OpenAI
        const openAIFormData = new FormData();
        openAIFormData.append('file', file);
        openAIFormData.append('model', 'whisper-1');
        openAIFormData.append('response_format', 'verbose_json');
        openAIFormData.append('timestamp_granularities[]', 'segment');

        // Direct API call to OpenAI using fetch
        console.log('Sending direct fetch request to OpenAI API');
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: openAIFormData,
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('OpenAI API error:', response.status, errorData);
            throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
        }

        const transcription = await response.json();
        console.log('Transcription successful');
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
        bodyParser: false, // Let Next.js handle the form data parsing
    },
}; 