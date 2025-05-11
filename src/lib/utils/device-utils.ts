/**
 * Utility functions for device capability detection
 */

// Extend the Navigator interface to include deviceMemory
interface NavigatorWithMemory extends Navigator {
    deviceMemory?: number;
}

/**
 * Calculate maximum video size based on device capabilities
 * @returns Maximum recommended video size in bytes
 */
export function getMaxVideoSize(): number {
    // Base size that most devices can handle
    let maxSizeMB = 50;

    // Adjust based on CPU cores
    const cpuCores = navigator.hardwareConcurrency || 2;
    if (cpuCores >= 8) maxSizeMB = 400;
    else if (cpuCores >= 4) maxSizeMB = 200;

    // Adjust based on available memory (if supported)
    if ('deviceMemory' in navigator) {
        const nav = navigator as NavigatorWithMemory;
        const memoryGB = nav.deviceMemory || 0;
        if (memoryGB >= 8) maxSizeMB = Math.max(maxSizeMB, 600);
        else if (memoryGB >= 4) maxSizeMB = Math.max(maxSizeMB, 300);
    }

    // Check if it's a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
    if (isMobile) {
        maxSizeMB = Math.min(maxSizeMB, 100); // Cap mobile to 100MB
    }

    return maxSizeMB * 1024 * 1024; // Return bytes
}

/**
 * Format bytes to human-readable size
 * @param bytes Number of bytes
 * @param decimals Decimal places to show
 * @returns Formatted string (e.g., "4.5 MB")
 */
export function formatFileSize(bytes: number, decimals = 1): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Estimate video processing time based on file size and device capabilities
 * @param fileSize File size in bytes
 * @returns Estimated processing time in minutes
 */
export function estimateProcessingTime(fileSize: number): number {
    const cpuCores = navigator.hardwareConcurrency || 2;

    // Basic formula: size in MB × factor / CPU cores
    // This is a very rough estimate and should be calibrated based on actual performance
    const sizeMB = fileSize / (1024 * 1024);
    const processingFactor = 0.5; // Adjust based on actual performance measurements

    return Math.ceil((sizeMB * processingFactor) / cpuCores);
} 