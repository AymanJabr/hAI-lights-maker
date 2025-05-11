'use client'

import { useState, useEffect } from 'react'
import { ApiKeyConfig as ApiKeyConfigType } from '@/types'
import { storeApiKey, getApiKey } from '@/lib/utils/api-utils'

// Import icons
import { KeyRound, Eye, EyeOff } from 'lucide-react'

interface ApiKeyConfigProps {
    onApiKeyConfigured: (config: ApiKeyConfigType) => void
}

export default function ApiKeyConfig({
    onApiKeyConfigured,
}: ApiKeyConfigProps) {
    const [apiKey, setApiKey] = useState('')
    const [showApiKey, setShowApiKey] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isValidating, setIsValidating] = useState(false)

    // Try to load saved API key on component mount
    useEffect(() => {
        const savedKey = getApiKey('openai')
        if (savedKey) {
            setApiKey(savedKey)
        }
    }, [])

    // Handle API key change
    const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setApiKey(e.target.value)
    }

    // Validate API key with the backend
    const validateApiKey = async (key: string) => {
        if (!key) return false

        setIsValidating(true)
        setError(null)

        try {
            const response = await fetch('/api/validate-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    apiKey: key,
                }),
            })

            const data = await response.json()

            if (!response.ok || !data.valid) {
                throw new Error(data.error || 'Failed to validate API key')
            }

            return true
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            return false
        } finally {
            setIsValidating(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!apiKey) {
            setError('Please enter your OpenAI API key')
            return
        }

        // Validate the API key
        const isValid = await validateApiKey(apiKey)

        if (!isValid) {
            return // Error is already set in validateApiKey
        }

        // Store API key in session storage
        storeApiKey('openai', apiKey)

        // Create config object
        const config: ApiKeyConfigType = {
            apiKey
        }

        // Notify parent component
        onApiKeyConfigured(config)

        setSuccess('API configuration saved successfully')
    }

    const handleClearApiKey = () => {
        // Clear from session storage
        sessionStorage.removeItem(`apiKey_openai`)

        // Reset state
        setApiKey('')

        // Show success message
        setSuccess('API key cleared successfully')
        setError(null)

        // Clear success message after 3 seconds
        setTimeout(() => {
            setSuccess(null)
        }, 3000)
    }

    return (
        <div className="w-full max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center space-x-2 mb-4">
                <KeyRound className="h-5 w-5 text-blue-500" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">API Configuration</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="text-red-500 text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                        {error}
                    </div>
                )}

                <div className="relative">
                    <label
                        htmlFor="apiKey"
                        className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-1"
                    >
                        OpenAI API Key
                    </label>
                    <div className="relative">
                        <input
                            id="apiKey"
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={handleApiKeyChange}
                            placeholder="Enter your OpenAI API key"
                            className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm placeholder:text-gray-600 dark:placeholder:text-gray-400"
                        />
                        <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                            {showApiKey ? (
                                <EyeOff className="h-4 w-4" />
                            ) : (
                                <Eye className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        <span>
                            Get your OpenAI API key from{' '}
                            <a
                                href="https://platform.openai.com/api-keys"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                OpenAI Platform
                            </a>
                        </span>
                        <div className="mt-1 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 rounded-md">
                            <p className="font-medium">🔐 Security Tip:</p>
                            <p>For extra safety, we recommend generating a new API key specifically for testing this project, and deleting it afterward.</p>
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={!apiKey || isValidating}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 dark:focus:ring-offset-gray-800"
                >
                    {isValidating ? 'Validating...' : 'Save API Settings'}
                </button>

                {success && (
                    <div className="mt-3 text-center text-blue-600 dark:text-blue-400 text-sm font-medium">
                        {success}
                    </div>
                )}

                <div className="pt-2 border-t border-gray-200 dark:border-gray-700 mt-4">
                    <div className="flex flex-col items-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            API keys are automatically cleared when page is closed
                        </p>
                        <button
                            type="button"
                            onClick={handleClearApiKey}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 focus:outline-none"
                        >
                            Clear Saved API Key
                        </button>
                    </div>
                </div>
            </form>
        </div>
    )
} 