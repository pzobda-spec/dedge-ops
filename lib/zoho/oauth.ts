import { ZOHO_TOKEN_URL } from './constants'

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

interface RefreshedToken {
  token: string
  expiresInSeconds: number
}

interface ZohoTokenProviderOptions {
  label: string
  refreshTokenEnv: string
  accessTokenEnv?: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

export function createZohoTokenProvider(options: ZohoTokenProviderOptions) {
  let cachedToken: string | null = null
  let tokenExpiresAt = 0
  let refreshPromise: Promise<RefreshedToken> | null = null

  return async function getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt) {
      return cachedToken
    }

    const directToken = options.accessTokenEnv ? process.env[options.accessTokenEnv] : null
    if (!forceRefresh && directToken) {
      cachedToken = directToken
      tokenExpiresAt = Date.now() + 55 * 60 * 1000
      return cachedToken
    }

    if (refreshPromise) {
      const refreshed = await refreshPromise
      cacheToken(refreshed)
      return refreshed.token
    }

    refreshPromise = refreshToken(options).finally(() => {
      refreshPromise = null
    })

    const refreshed = await refreshPromise
    cacheToken(refreshed)
    return refreshed.token
  }

  function cacheToken(refreshed: RefreshedToken) {
    cachedToken = refreshed.token
    tokenExpiresAt = nextExpiryMs(refreshed.expiresInSeconds)
  }

  async function refreshToken(providerOptions: ZohoTokenProviderOptions): Promise<RefreshedToken> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: requireEnv('ZOHO_CLIENT_ID'),
      client_secret: requireEnv('ZOHO_CLIENT_SECRET'),
      refresh_token: requireEnv(providerOptions.refreshTokenEnv),
    })

    const res = await fetch(ZOHO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    const data = await res.json().catch(() => ({} as TokenResponse))

    if (!res.ok) {
      throw new Error(`${providerOptions.label} token refresh failed: ${res.status} ${JSON.stringify(data)}`)
    }

    if (data.error || !data.access_token) {
      throw new Error(`${providerOptions.label} token error: ${data.error ?? JSON.stringify(data)}`)
    }

    return {
      token: data.access_token,
      expiresInSeconds: Number(data.expires_in ?? 3600),
    }
  }
}

function nextExpiryMs(expiresInSeconds: number): number {
  return Date.now() + Math.max(expiresInSeconds - 60, 60) * 1000
}
