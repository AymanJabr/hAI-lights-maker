import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(
    request: Request,
): Promise<NextResponse> {
    const body = (await request.json()) as HandleUploadBody;

    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async () => {
                // Validation logic here
                return {
                    allowedContentTypes: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'],
                };
            },
            onUploadCompleted: async ({ blob, tokenPayload }) => {
                // You can use this callback to trigger other actions
                // such as updating a database with the blob's URL.
                console.log('Blob upload completed:', blob, tokenPayload);
            },
        });

        return NextResponse.json(jsonResponse);
    } catch (error) {
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 400 },
        );
    }
} 