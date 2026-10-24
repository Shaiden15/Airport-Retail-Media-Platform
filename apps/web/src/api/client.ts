export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Only same-origin /api/ paths are ever requested, so a caller can never point the client at another host
function apiUrl(path: string): URL {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) throw new ApiError(400, 'Blocked request outside the API');
  return url;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Browser client limited to same-origin /api/ by apiUrl, so server-side SSRF does not apply (SECURITY.md)
  // nosemgrep: gitlab.nodejs_scan.javascript-ssrf-rule-node_ssrf
  const res = await fetch(apiUrl(path), { ...init, headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
