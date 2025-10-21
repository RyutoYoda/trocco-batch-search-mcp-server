import { performance } from 'node:perf_hooks';
import {
  REQUEST_TIMEOUT_MS,
  TROCCO_API_KEY,
  TROCCO_BASE_URL,
  TROCCO_AUTH_HEADER,
  TROCCO_AUTH_SCHEME,
  TROCCO_EXTRA_HEADERS,
} from './env.js';
import { getByPath, safeJsonStringify, toPlainHeaders } from './utils.js';

export class TroccoApiError extends Error {
  constructor(message, { request, response } = {}) {
    super(message);
    this.name = 'TroccoApiError';
    this.request = request;
    this.response = response;
  }
}

export class TroccoClient {
  constructor({ baseUrl = TROCCO_BASE_URL, apiKey = TROCCO_API_KEY, timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl } = {}) {
    if (!baseUrl) {
      throw new Error('TroccoClient requires a baseUrl');
    }
    if (!apiKey) {
      throw new Error('TroccoClient requires an API key');
    }

    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);

    if (typeof this.fetch !== 'function') {
      throw new Error('No fetch implementation available. Supply fetchImpl when instantiating TroccoClient.');
    }
  }

  buildUrl(path, query) {
    if (!path || typeof path !== 'string') {
      throw new Error('TroccoClient request requires a path string');
    }

    const normalizedPath = path.startsWith('http')
      ? (() => {
          const url = new URL(path);
          if (!url.href.startsWith(this.baseUrl)) {
            throw new Error('External URLs are not allowed. Pass a relative Trocco API path.');
          }
          return url.pathname + url.search + url.hash;
        })()
      : path.startsWith('/')
        ? path.slice(1)
        : path;

    const url = new URL(normalizedPath, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            url.searchParams.append(key, String(item));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url;
  }

  buildHeaders(headers = {}) {
    const authHeader = TROCCO_AUTH_HEADER || 'Authorization';
    const authValue = TROCCO_AUTH_SCHEME ? `${TROCCO_AUTH_SCHEME} ${this.apiKey}`.trim() : this.apiKey;

    return {
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      'Content-Type': 'application/json',
      [authHeader]: authValue,
      'User-Agent': 'trocco-mcp-server/0.1.0 (+https://claude.ai)',
      ...TROCCO_EXTRA_HEADERS,
      ...headers,
    };
  }

  async request({
    path,
    method = 'GET',
    query,
    body,
    headers,
    timeoutMs,
    signal,
    responseType = 'auto',
  }) {
    const url = this.buildUrl(path, query);
    const controller = new AbortController();
    const signals = [controller.signal];
    if (signal) {
      signals.push(signal);
    }

    const compositeSignal = signals.length === 1 ? controller.signal : anySignal(signals);

    const abortTimeout = setTimeout(() => {
      controller.abort(new Error(`Trocco API request timed out after ${timeoutMs ?? this.timeoutMs} ms`));
    }, timeoutMs ?? this.timeoutMs);
    abortTimeout.unref?.();

    const requestInit = {
      method,
      headers: this.buildHeaders(headers),
      signal: compositeSignal,
    };

    if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
      if (typeof body === 'string' || body instanceof Uint8Array) {
        requestInit.body = body;
      } else {
        requestInit.body = JSON.stringify(body);
      }
    }

    const requestContext = {
      url: url.toString(),
      method,
      body,
      query,
      headers: requestInit.headers,
      timeoutMs: timeoutMs ?? this.timeoutMs,
    };

    const start = performance.now();

    try {
      const response = await this.fetch(url, requestInit);
      const durationMs = performance.now() - start;
      const rawText = await response.text();
      let parsed;

      if (rawText && shouldParseJson(response, responseType)) {
        try {
          parsed = JSON.parse(rawText);
        } catch (jsonError) {
          parsed = undefined;
        }
      }

      const summary = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        method,
        durationMs,
        headers: toPlainHeaders(response.headers),
        data: parsed,
        text: parsed !== undefined ? undefined : rawText || undefined,
      };

      if (!response.ok) {
        throw new TroccoApiError(
          `Trocco API responded with ${response.status} ${response.statusText}`,
          {
            request: requestContext,
            response: summary,
          },
        );
      }

      return summary;
    } catch (error) {
      if (error instanceof TroccoApiError) {
        throw error;
      }
      const wrapped = new TroccoApiError(error.message, { request: requestContext });
      wrapped.cause = error;
      throw wrapped;
    } finally {
      clearTimeout(abortTimeout);
    }
  }

  async paginate({
    path,
    method = 'GET',
    query = {},
    body,
    headers,
    pageParam = 'page',
    pageSizeParam = 'per_page',
    startPage = 1,
    pageSize,
    maxPages = 50,
    dataPath,
    nextPagePath,
    stopWhenEmpty = true,
    timeoutMs,
  }) {
    const collected = [];
    const responses = [];
    let currentPage = startPage;
    let pagesFetched = 0;
    let nextPageValue;

    while (pagesFetched < maxPages) {
      const pageQuery = {
        ...query,
        [pageParam]: nextPageValue ?? currentPage,
      };
      if (pageSize && pageSizeParam) {
        pageQuery[pageSizeParam] = pageSize;
      }

      const response = await this.request({ path, method, query: pageQuery, body, headers, timeoutMs });
      responses.push(response);

      const data = dataPath ? getByPath(response.data, dataPath) : response.data;

      if (Array.isArray(data)) {
        collected.push(...data);
        if (stopWhenEmpty && data.length === 0) {
          break;
        }
        if (pageSize && data.length < pageSize) {
          break;
        }
      } else if (data !== undefined) {
        collected.push(data);
        if (stopWhenEmpty) {
          break;
        }
      } else if (stopWhenEmpty) {
        break;
      }

      pagesFetched += 1;

      if (nextPagePath) {
        nextPageValue = getByPath(response.data, nextPagePath);
        if (nextPageValue === undefined || nextPageValue === null || nextPageValue === false) {
          break;
        }
      } else {
        currentPage += 1;
      }
    }

    return {
      items: collected,
      responses,
    };
  }
}

function shouldParseJson(response, responseType) {
  if (responseType === 'json') {
    return true;
  }
  if (responseType === 'text') {
    return false;
  }
  const contentType = response.headers.get('content-type');
  if (!contentType) {
    return false;
  }
  return contentType.includes('application/json') || contentType.includes('+json');
}

function anySignal(signals) {
  const controller = new AbortController();

  const onAbort = (event) => {
    controller.abort(event?.target?.reason ?? event?.target?.signal?.reason ?? undefined);
  };

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return controller.signal;
}

export function summarizeError(error) {
  if (error instanceof TroccoApiError) {
    return safeJsonStringify(
      {
        message: error.message,
        request: error.request,
        response: error.response,
      },
      2,
    );
  }
  return safeJsonStringify({ message: error.message, stack: error.stack }, 2);
}
