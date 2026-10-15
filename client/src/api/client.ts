/** HTTP client for /api. Uses cookies (credentials) and sends user timezone for schedule math. */
const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function getTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Timezone": getTimeZone(),
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? "Request failed",
      res.status,
      (data as { code?: string }).code
    );
  }

  return data as T;
}

/** POST JSON and stream a plain-text response, calling onChunk as text arrives. */
export async function apiStream(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Timezone": getTimeZone(),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      (data as { error?: string }).error ?? "Request failed",
      res.status,
      (data as { code?: string }).code
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) onChunk(text);
  }
}
