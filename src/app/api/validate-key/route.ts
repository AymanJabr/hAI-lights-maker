import { NextRequest, NextResponse } from 'next/server'

// Validate OpenAI API key
export async function POST(req: NextRequest) {
    const { apiKey } = await req.json()

    if (!apiKey) {
        return NextResponse.json(
            { error: 'API key is required' },
            { status: 400 }
        )
    }

    try {
        // Simple validation of API key by checking if it's a valid format
        if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
            throw new Error('API key appears to be invalid')
        }

        // For a more thorough validation, we could make a simple API call to OpenAI
        // This is a simple validation that just checks the format

        return NextResponse.json({
            valid: true,
            message: 'API key format is valid'
        })
    } catch (error) {
        console.error('Error validating API key:', error)
        return NextResponse.json({
            valid: false,
            error: error instanceof Error ? error.message : String(error)
        }, { status: 400 })
    }
} 