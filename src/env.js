import { config as loadDotEnv } from 'dotenv';

const dotenvPath = process.env.TROCCO_MCP_ENV_PATH;
const { error } = loadDotEnv(dotenvPath ? { path: dotenvPath } : {});
if (error && process.env.NODE_ENV !== 'production') {
  console.warn('[trocco-mcp] Unable to load .env file:', error.message);
}

const rawApiKey = process.env.TROCCO_API_KEY ?? process.env.TROCCO_TOKEN;
if (!rawApiKey || !rawApiKey.trim()) {
  throw new Error('Missing Trocco API key. Set TROCCO_API_KEY in your environment.');
}

export const TROCCO_API_KEY = rawApiKey.trim();

const defaultBaseUrl = 'https://trocco.io/';
const rawBaseUrl = process.env.TROCCO_BASE_URL ?? defaultBaseUrl;
export const TROCCO_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;

export const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.TROCCO_TIMEOUT_MS ?? '45000', 10);

export const TROCCO_AUTH_HEADER = (process.env.TROCCO_AUTH_HEADER ?? 'Authorization').trim();
export const TROCCO_AUTH_SCHEME = (process.env.TROCCO_AUTH_SCHEME ?? 'Token').trim();

export const TROCCO_EXTRA_HEADERS = (() => {
  const raw = process.env.TROCCO_EXTRA_HEADERS;
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (parseError) {
    console.warn('[trocco-mcp] Failed to parse TROCCO_EXTRA_HEADERS JSON:', parseError.message);
  }
  return {};
})();
