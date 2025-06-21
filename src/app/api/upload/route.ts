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
            onBeforeGenerateToken: async (pathname: string) => {
                // This is where you can add validation or any other logic
                // before a client is allowed to upload a file.
                // For now, we'll just allow all uploads.
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