import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import formidable, { File as FormidableFile, Fields, Files } from 'formidable';
import fs from 'fs';
import os from 'os';
import { Readable } from 'node:stream';

const CONFIGURED_MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5 GiB
const CONFIGURED_MAX_FILE_SIZE_GB = CONFIGURED_MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024);

// Helper function to parse the form using formidable
function parseForm(
    request: NextRequest
): Promise<{ fields: Fields; files: Files }> {
    return new Promise((resolve, reject) => {
        const form = formidable({
            uploadDir: os.tmpdir(),
            keepExtensions: true,
            maxFileSize: CONFIGURED_MAX_FILE_SIZE_BYTES, // Use the module-level constant
            maxTotalFileSize: CONFIGURED_MAX_FILE_SIZE_BYTES, // Use the module-level constant
            multiples: true, // Important for formidable.parse callback to provide arrays for multiple files/fields
            filter: ({ name, originalFilename, mimetype }) => {
                if (name === 'file') {
                    const isFileTypeAllowed =
                        mimetype &&
                        (mimetype.includes('audio') ||
                            mimetype.includes('video') ||
                            mimetype.includes('mp4') ||
                            mimetype.includes('mp3') ||
                            mimetype.includes('mpeg') ||
                            mimetype.includes('wav') ||
                            mimetype.includes('m4a') ||
                            mimetype.includes('webm'));
                    if (!isFileTypeAllowed) {
                        console.warn(
                            `Skipping file upload for field ${name}: ${originalFilename} (type: ${mimetype}) - not an accepted audio/video format.`
                        );
                        return false;
                    }
                }
                return true;
            },
        });

        // Create a mock Node.js IncomingMessage-like object for formidable.parse
        // It needs a .headers property and to be a Readable stream.
        const formattedHeaders: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            formattedHeaders[key.toLowerCase()] = value;
        });

        if (!request.body) {
            return reject(new Error('Request body is null'));
        }

        // Convert the Web Stream to a Node.js Readable stream
        const nodeReadable = Readable.fromWeb(request.body as any);

        // Assign headers to the stream object, as formidable.parse expects it on the req object
        (nodeReadable as any).headers = formattedHeaders;

        // Add a no-op .socket property if formidable checks for it (sometimes needed for IncomingMessage mocks)
        (nodeReadable as any).socket = { remoteAddress: 'mock' };

        form.parse(nodeReadable as any, (err, fields, files) => {
            if (err) {
                console.error('Formidable parsing error:', err);
                reject(err);
                return;
            }
            resolve({ fields, files });
        });
    });
}

export async function POST(request: NextRequest) {
    let tempFilepath: string | undefined = undefined;

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

        console.log('Starting form parsing with formidable...');
        const parsedForm = await parseForm(request);
        const filesFromFormidable = parsedForm.files;
        console.log('Formidable parsing complete. Fields:', parsedForm.fields, 'Files:', Object.keys(filesFromFormidable));

        const fileField = filesFromFormidable.file;
        if (!fileField) {
            console.error('No file found in formidable result for field "file". Available file fields:', Object.keys(filesFromFormidable));
            return NextResponse.json(
                { error: 'Audio file is required in "file" field' },
                { status: 400 }
            );
        }

        const formidableFile = Array.isArray(fileField)
            ? fileField[0]
            : fileField;

        if (
            !formidableFile ||
            !formidableFile.filepath ||
            formidableFile.size === 0
        ) {
            if (formidableFile && formidableFile.size === 0 && formidableFile.originalFilename) {
                console.error(
                    `File ${formidableFile.originalFilename} was processed by formidable but resulted in a zero-size file. It might have been filtered or an empty file was uploaded.`
                );
                return NextResponse.json(
                    { error: `File ${formidableFile.originalFilename} is empty or was filtered out.` },
                    { status: 400 }
                );
            }
            return NextResponse.json(
                { error: 'Audio file processing failed or file is empty/invalid' },
                { status: 500 }
            );
        }

        tempFilepath = formidableFile.filepath;

        console.log(
            'Received file via formidable:',
            formidableFile.originalFilename,
            'Size:',
            formidableFile.size,
            'Stored at:',
            tempFilepath
        );

        const audioReadStream = fs.createReadStream(tempFilepath);
        console.log('Sending request to OpenAI API via SDK with fs.ReadStream');
        const transcription = await openai.audio.transcriptions.create({
            file: audioReadStream,
            model: 'whisper-1',
            response_format: 'verbose_json',
            timestamp_granularities: ['segment'],
        });

        console.log('Transcription successful');
        return NextResponse.json(transcription);
    } catch (error) {
        console.error('Transcription error:', error);

        // Check for formidable file size error
        // Formidable errors for file size (like code 1009) often include an httpCode property.
        // @ts-ignore - Accessing a potential custom property from formidable error
        if (error && typeof error === 'object' && (error.code === 1009 || error.httpCode === 413)) {
            return NextResponse.json(
                {
                    error: `File exceeds the ${CONFIGURED_MAX_FILE_SIZE_GB}GB size limit.`,
                    // @ts-ignore
                    details: error.message || 'Formidable file size limit exceeded'
                },
                { status: 413 } // Payload Too Large
            );
        }

        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error during transcription';

        let statusCode = 500;
        if (error instanceof OpenAI.APIError) {
            statusCode = error.status || 500;
        } else if (error instanceof Error && errorMessage.includes('401')) {
            statusCode = 401;
        }
        const errorDetails = error instanceof Error ? (error.stack || (error.cause ? JSON.stringify(error.cause) : undefined)) : String(error);

        return NextResponse.json(
            {
                error: errorMessage,
                details: errorDetails,
                apiErrorStatus: error instanceof OpenAI.APIError ? error.status : undefined,
                apiErrorType: error instanceof OpenAI.APIError ? error.type : undefined,
            },
            { status: statusCode }
        );
    } finally {
        if (tempFilepath) {
            console.log('Attempting to clean up temp file:', tempFilepath);
            fs.unlink(tempFilepath, (err) => {
                if (err) {
                    console.error(
                        'Failed to delete temporary file:',
                        tempFilepath,
                        err
                    );
                } else {
                    console.log('Temporary file deleted successfully:', tempFilepath);
                }
            });
        }
    }
}

// Config to disable Next.js body parser, formidable will handle it.
export const config = {
    api: {
        bodyParser: false,
    },
}; 