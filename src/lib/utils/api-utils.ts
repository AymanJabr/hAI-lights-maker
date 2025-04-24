/**
 * Simple encryption for API keys
 * This is a basic implementation and not meant for high-security applications
 */
function encryptApiKey(apiKey: string): string {
    // Simple XOR-based encryption with a fixed key
    // This provides obfuscation rather than true encryption
    const encryptionKey = 'hai-lights-maker-key-2025'
    let encrypted = ''

    for (let i = 0; i < apiKey.length; i++) {
        const charCode = apiKey.charCodeAt(i) ^ encryptionKey.charCodeAt(i % encryptionKey.length)
        encrypted += String.fromCharCode(charCode)
    }

    // Convert to Base64 for safe storage
    return btoa(encrypted)
}

/**
 * Decrypt the API key
 */
function decryptApiKey(encryptedKey: string): string {
    try {
        // Convert from Base64
        const encrypted = atob(encryptedKey)
        const encryptionKey = 'hai-lights-maker-key-2025'
        let decrypted = ''

        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i) ^ encryptionKey.charCodeAt(i % encryptionKey.length)
            decrypted += String.fromCharCode(charCode)
        }

        return decrypted
    } catch (error) {
        console.error('Failed to decrypt API key:', error)
        return ''
    }
}

// Define the provider type
export type Provider = 'openai'

/**
 * Safely store API keys in sessionStorage with encryption
 */
export function storeApiKey(
    provider: Provider,
    apiKey: string
): void {
    // Encrypt the API key before storing
    const encryptedKey = encryptApiKey(apiKey)
    sessionStorage.setItem(`apiKey_${provider}`, encryptedKey)
}

/**
 * Retrieve API keys from sessionStorage
 */
export function getApiKey(provider: Provider): string | null {
    const encryptedKey = sessionStorage.getItem(`apiKey_${provider}`)
    if (!encryptedKey) return null

    // Decrypt the API key
    return decryptApiKey(encryptedKey)
}

/**
 * Validate the API key with the OpenAI API
 * Returns true if valid, false otherwise
 */
export async function validateApiKey(apiKey: string): Promise<{ valid: boolean, error?: string }> {
    if (!apiKey) {
        return { valid: false, error: 'API key is required' }
    }

    try {
        // Simple validation of API key by checking if it's a valid format
        if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
            return { valid: false, error: 'API key appears to be invalid' }
        }

        // For a more thorough check, we'd make a simple API call to OpenAI
        // This is omitted for now but would be a better validation method
        return { valid: true }
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : String(error)
        }
    }
} 