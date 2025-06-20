import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import fetch from 'node-fetch';

export async function POST(request: NextRequest) {
    try {
        const apiKey = request.headers.get('X-API-KEY');
        if (!apiKey) {
            return NextResponse.json(
                { error: 'OpenAI API key is required' },
                { status: 401 }
            );
        }
        if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
            return NextResponse.json(
                { error: 'Invalid API key format' },
                { status: 401 }
            );
        }

        const openai = new OpenAI({ apiKey });

        const body = await request.json();
        const { fileUrl } = body;

        if (!fileUrl) {
            return NextResponse.json(
                { error: 'fileUrl is required' },
                { status: 400 }
            );
        }

        console.log(`Fetching audio file from URL: ${fileUrl}`);
        const audioResponse = await fetch(fileUrl);
        if (!audioResponse.ok) {
            throw new Error(
                `Failed to fetch audio file: ${audioResponse.statusText}`
            );
        }

        // OpenAI SDK now supports passing a fetch Response directly
        console.log('Sending request to OpenAI API via SDK with fetch Response');
        const transcription = await openai.audio.transcriptions.create({
            file: audioResponse,
            model: 'whisper-1',
            response_format: 'verbose_json',
            timestamp_granularities: ['segment'],
        });

        console.log('Transcription successful');
        return NextResponse.json(transcription);
    } catch (error) {
        console.error('Transcription error:', error);

        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error during transcription';

        let statusCode = 500;
        if (error instanceof OpenAI.APIError) {
            statusCode = error.status || 500;
        } else if (error instanceof Error && errorMessage.includes('401')) {
            statusCode = 401;
        }
        const errorDetails =
            error instanceof Error
                ? error.stack || (error.cause ? JSON.stringify(error.cause) : undefined)
                : String(error);

        return NextResponse.json(
            {
                error: errorMessage,
                details: errorDetails,
                apiErrorStatus:
                    error instanceof OpenAI.APIError ? error.status : undefined,
                apiErrorType: error instanceof OpenAI.APIError ? error.type : undefined,
            },
            { status: statusCode }
        );
    }
}

// Config to disable Next.js body parser, formidable will handle it.
export const config = {
    api: {
        bodyParser: false,
    },
}; 