import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { VideoSegment } from '@/types';

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

        // Parse request body
        const { transcript, prompt, maxDuration, videoDuration } = await request.json();

        if (!transcript) {
            return NextResponse.json(
                { error: 'Transcript is required' },
                { status: 400 }
            );
        }

        // Build system message
        const systemMessage = `
      You are an expert video editor helping to create highlight reels from longer videos.
      Analyze the transcript and find the most engaging segments based on the following criteria: ${prompt}
      
      Return ONLY JSON array of segments with the following properties:
      - start: timestamp in seconds when segment should start
      - end: timestamp in seconds when segment should end
      - description: brief description of why this segment is interesting
      
      Rules:
      1. Total duration of all segments should not exceed ${maxDuration} seconds
      2. Each segment should be between 3-20 seconds long
      3. Choose diverse segments from different parts of the video
      4. The full video duration is ${videoDuration} seconds
      5. Focus on complete thoughts or actions
      6. Don't include incomplete sentences
      7. Return between 3-10 segments depending on video length and content
    `;

        // Call OpenAI's chat completion API
        const response = await openai.chat.completions.create({
            model: 'gpt-4-turbo',
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: transcript }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
        });

        // Parse the response
        const content = response.choices[0]?.message.content;
        if (!content) {
            throw new Error('Empty response from OpenAI');
        }

        let segments: VideoSegment[];
        try {
            const parsedResult = JSON.parse(content);
            segments = parsedResult.segments || [];

            // Validate each segment
            segments = segments.filter(segment =>
                typeof segment.start === 'number' &&
                typeof segment.end === 'number' &&
                segment.start < segment.end &&
                segment.start >= 0 &&
                segment.end <= videoDuration
            );

            // Sort by start time
            segments.sort((a, b) => a.start - b.start);

        } catch (err) {
            console.error('Error parsing OpenAI response:', content);
            throw new Error('Failed to parse OpenAI response');
        }

        return NextResponse.json(segments);
    } catch (error) {
        console.error('Highlights error:', error);
        // Check if it's an OpenAI API error
        const errorMessage = error instanceof Error
            ? error.message
            : 'Unknown error generating highlights';

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