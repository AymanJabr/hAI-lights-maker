import { useState, useEffect, useRef } from 'react';

interface LogEntry {
    message: string;
    timestamp: Date;
    type: 'info' | 'progress' | 'success' | 'error';
}

interface ProcessingLogProps {
    isProcessing: boolean;
    latestMessage?: string;
}

export default function ProcessingLog({ isProcessing, latestMessage }: ProcessingLogProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [expanded, setExpanded] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const isFirstRender = useRef(true);

    // Capture console.log and console.error messages
    useEffect(() => {
        console.log("ProcessingLog component mounted");

        const originalConsoleLog = console.log;
        const originalConsoleError = console.error;

        // Create a custom log handler
        const logHandler = (message: any, type: LogEntry['type'] = 'info') => {
            let formattedMessage = '';

            // Format the message based on type
            if (typeof message === 'object' && message !== null) {
                try {
                    formattedMessage = JSON.stringify(message);
                } catch (e) {
                    formattedMessage = String(message);
                }
            } else {
                formattedMessage = String(message);
            }

            // Special handling for processing messages
            if (formattedMessage.includes('Processing:')) {
                type = 'progress';
            } else if (formattedMessage.includes('complete') || formattedMessage.includes('completed')) {
                type = 'success';
            } else if (formattedMessage.includes('error') || formattedMessage.includes('Error') || formattedMessage.includes('failed') || formattedMessage.includes('Failed')) {
                type = 'error';
                // For errors, expand the log panel automatically
                setExpanded(true);
            }

            // Add the log entry
            setLogs(prevLogs => [
                ...prevLogs,
                { message: formattedMessage, timestamp: new Date(), type }
            ]);
        };

        // Override console.log
        console.log = function (...args: any[]) {
            originalConsoleLog.apply(console, args);
            if (args.length > 0) {
                logHandler(args[0]);
            }
        };

        // Override console.error
        console.error = function (...args: any[]) {
            originalConsoleError.apply(console, args);
            if (args.length > 0) {
                logHandler(args[0], 'error');
            }
        };

        // Restore original console methods on cleanup
        return () => {
            console.log = originalConsoleLog;
            console.error = originalConsoleError;
            console.log("ProcessingLog component unmounted");
        };
    }, []); // Only run once on mount

    // Add an initial log entry when processing starts
    useEffect(() => {
        if (isProcessing && isFirstRender.current) {
            isFirstRender.current = false;
            setLogs(prevLogs => [
                ...prevLogs,
                {
                    message: 'Starting video processing...',
                    timestamp: new Date(),
                    type: 'info'
                }
            ]);
            // Start with log expanded during processing
            setExpanded(true);
        } else if (!isProcessing) {
            isFirstRender.current = true;
        }
    }, [isProcessing]);

    // Add new log when latestMessage changes
    useEffect(() => {
        if (latestMessage) {
            setLogs(prevLogs => [
                ...prevLogs,
                { message: latestMessage, timestamp: new Date(), type: 'progress' }
            ]);
        }
    }, [latestMessage]); // Don't depend on isProcessing here

    // Auto scroll to bottom when new logs appear
    useEffect(() => {
        if (logContainerRef.current && expanded) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, expanded]);

    // Always show if there are logs
    if (logs.length === 0) {
        return null;
    }

    // Count errors for the UI
    const errorCount = logs.filter(log => log.type === 'error').length;

    return (
        <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            <div
                className={`p-3 ${errorCount > 0 ? 'bg-red-50 border-b border-red-200' : 'bg-gray-100 border-b border-gray-200'} flex justify-between items-center cursor-pointer`}
                onClick={() => setExpanded(!expanded)}
            >
                <h3 className={`text-sm font-medium ${errorCount > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                    {errorCount > 0 ? `Processing Errors (${errorCount})` : 'Processing Details'} {expanded ? '▼' : '▶'}
                </h3>
                <span className="text-xs text-gray-500">
                    {logs.length} log entries
                </span>
            </div>

            {expanded && (
                <div
                    ref={logContainerRef}
                    className="p-3 max-h-64 overflow-y-auto text-sm font-mono"
                    style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4' }}
                >
                    {logs.map((log, index) => (
                        <div key={index} className="mb-1">
                            <span className="text-gray-400 mr-2">
                                {log.timestamp.toLocaleTimeString()}
                            </span>
                            <span
                                className={`${log.type === 'error'
                                    ? 'text-red-400'
                                    : log.type === 'success'
                                        ? 'text-green-400'
                                        : log.type === 'progress'
                                            ? 'text-blue-400'
                                            : 'text-gray-200'
                                    }`}
                            >
                                {log.message}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {!expanded && logs.length > 0 && (
                <div className={`p-3 text-sm ${errorCount > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    <div className="flex items-center">
                        {errorCount > 0 ? (
                            <div className="mr-2 h-2 w-2 rounded-full bg-red-500"></div>
                        ) : (
                            <div className="animate-pulse mr-2 h-2 w-2 rounded-full bg-blue-500"></div>
                        )}
                        <span>{logs[logs.length - 1].message}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Click to see all details
                    </p>
                </div>
            )}
        </div>
    );
} 