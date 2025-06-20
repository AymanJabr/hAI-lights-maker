# HAI-Lights Maker

An AI-powered video highlight generator that automatically creates engaging clips from longer videos.

## Overview

HAI-Lights Maker is a web application that uses AI to analyze videos and create highlight reels based on different criteria. Upload a long video (like a webinar, sports event, or presentation) and the app will:

1. Transcribe the audio using OpenAI's Whisper model
2. Analyze the content to find interesting moments
3. Extract highlights based on your chosen style (key highlights, epic moments, main ideas, or funny clips)
4. Generate a highlight video ready for social media in your preferred format

## Features

- **Easy Video Upload**: Drag & drop interface for uploading videos
- **AI-Powered Analysis**: Uses OpenAI models to understand video content
- **Custom Highlight Styles**: Choose different vibes for your highlight reel or create a custom prompt
- **Multiple Export Formats**: Generate videos optimized for different platforms (YouTube, TikTok, Instagram)
- **Client-side Processing**: Video processing happens in the browser using WebAssembly
- **Segment-based Workflow**: Process and review individual segments before combining them
- **In-browser Video Player**: Feature-rich video player with custom controls
- **Responsive UI**: Works across different devices and screen sizes

## Technologies Used

- Next.js with App Router
- TypeScript
- Tailwind CSS for styling
- FFmpeg.wasm for client-side video processing
- TensorFlow.js and MediaPipe for face detection
- OpenAI API for transcription and content analysis
- Web Workers for performance-intensive tasks
- Turbopack for faster development builds

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm package manager
- An OpenAI API key

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/hai-lights-maker.git
cd hai-lights-maker
```

2. Install dependencies:

```bash
pnpm install
```

3. Create a `.env.local` file in the root directory and add your OpenAI API key:

```
OPENAI_API_KEY=your_api_key_here
```

4. Start the development server:

```bash
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Enter your OpenAI API key (or the app will use the one from environment variables if available)
2. Upload a video file
3. Select your highlight style and target platform
4. Click "Generate Highlights" and wait for processing
5. Review and edit the suggested segments
6. Approve segments to include in your final video
7. Preview and download individual segments or combine them into a final highlight reel

## API Key Security

HAI-Lights Maker implements several security measures to protect your OpenAI API key:

- **Session-only storage**: Your API key is only stored in your browser's session storage and is automatically cleared when you close your browser tab.
- **Client-side encryption**: Before storing, your API key is encrypted using a simple XOR cipher with a project-specific encryption key.
- **Format validation**: The API key is validated to ensure it follows the correct OpenAI API key format (starting with 'sk-').
- **Secure transmission**: Your API key is only transmitted between your browser and the API endpoints on this server, never to third-party services.
- **Server-side validation**: Each API request validates the API key again before proceeding.


## Segment Processing Workflow

The application follows a systematic process for creating video highlights:

1. **Step 1: Video Upload and Analysis**
   - Upload your video and adjust settings
   - The app transcribes and analyzes the content

2. **Step 2: Generate Individual Segments**
   - AI identifies potential highlight segments
   - Each segment is processed individually in sequence
   - You can review and edit the suggested segments

3. **Step 3: Review and Approval**
   - Preview each segment in the built-in video player
   - Edit segment timestamps if needed
   - Approve segments to include in your final video

4. **Step 4: Generate Final Output**
   - After approving segments, you can download them individually
   - Click the "Combine Segments Into Video" button to create a single highlight reel
   - The combined video uses your selected format settings (YouTube, TikTok, Instagram)

This approach separates resource-intensive tasks, preventing them from interfering with each other and providing a more reliable experience.

## Future Enhancements

- Add support for audio analysis to detect applause, music, or emotional moments
- Implement more advanced video filters and transitions
- Add batch processing for multiple videos
- Include speech emotion detection for better highlight selection
- Support for longer videos with optimized processing

## License

MIT

## Acknowledgments

- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) for bringing video processing to the browser
- [TensorFlow.js](https://www.tensorflow.org/js) and [MediaPipe](https://mediapipe.dev/) for the face detection models
- [OpenAI](https://openai.com/) for their powerful API services
