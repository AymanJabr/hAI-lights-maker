import { useState, useEffect } from 'react';

export function useSegmentsCompletionStatus() {
    const [areAllSegmentsComplete, setAreAllSegmentsComplete] = useState(false);

    useEffect(() => {
        // Function to handle the segments completion event
        const handleSegmentsComplete = () => {
            setAreAllSegmentsComplete(true);
        };

        // Add event listener
        window.addEventListener('segmentsProcessingComplete', handleSegmentsComplete);

        // Cleanup
        return () => {
            window.removeEventListener('segmentsProcessingComplete', handleSegmentsComplete);
        };
    }, []);

    return areAllSegmentsComplete;
} 