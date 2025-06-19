/**
 * Configuration constants for the application.
 */

// Base URL for where the FFmpeg core files are hosted.
// In production, these are served from the /public directory.
const FFMPEG_BASE_URL = '/ffmpeg';

// Paths to the self-hosted FFmpeg core files.
// Using these is crucial for production builds to comply with Cross-Origin-Embedder-Policy (COEP).
export const FFMPEG_CORE_URL = `${FFMPEG_BASE_URL}/ffmpeg-core.js`;
export const FFMPEG_WASM_URL = `${FFMPEG_BASE_URL}/ffmpeg-core.wasm`; 