import { inspect } from 'node:util';

export function safeJsonStringify(value, space = 2) {
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'bigint') {
          return val.toString();
        }
        if (val instanceof Map) {
          return Object.fromEntries(val.entries());
        }
        if (val instanceof Set) {
          return Array.from(val.values());
        }
        if (val instanceof Date) {
          return val.toISOString();
        }
        return val;
      },
      space,
    );
  } catch (error) {
    return inspect(value, { depth: 5, colors: false, breakLength: 80 });
  }
}

export function getByPath(input, rawPath) {
  if (!rawPath) {
    return input;
  }

  const path = rawPath
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);

  let current = input;
  for (const segment of path) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (Number.isInteger(index)) {
        current = current[index];
        continue;
      }
      return undefined;
    }

    if (typeof current === 'object') {
      current = current[segment];
      continue;
    }

    return undefined;
  }

  return current;
}

export function renderTemplate(template, context) {
  if (!template) {
    return template;
  }

  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    const lookupKey = key.trim();
    const value = getByPath(context, lookupKey);
    if (value === undefined || value === null) {
      throw new Error(`Missing value for template variable "${lookupKey}"`);
    }
    return encodeURIComponent(String(value));
  });
}

export function ensureArray(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function toPlainHeaders(headers) {
  if (!headers) {
    return {};
  }

  if (headers instanceof Map) {
    return Object.fromEntries(headers);
  }

  if (typeof headers.entries === 'function') {
    const result = {};
    for (const [key, val] of headers.entries()) {
      result[key] = val;
    }
    return result;
  }

  return { ...headers };
}
