import { ApiError } from './errors';
import { handleMockRequest } from './mocks';

export { ApiError } from './errors';

/**
 * Universal fetch client for Poora Teeka.
 * Supports realistic mock responses with randomized 400-700ms delays when
 * NEXT_PUBLIC_USE_MOCKS === 'true', and real HTTP API calls otherwise.
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

  if (useMocks) {
    // Artificial 400-700ms randomized delay to simulate realistic network latency
    const delayMs = Math.floor(Math.random() * (700 - 400 + 1)) + 400;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    return handleMockRequest<T>(path, options);
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://o025clnwai.execute-api.ap-south-1.amazonaws.com';
  const normalizedBase = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${normalizedBase}${normalizedPath}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    console.warn(`[apiFetch] Network request to ${url} failed; falling back to mock:`, networkErr);
    return handleMockRequest<T>(path, options);
  }

  if (!response.ok) {
    let errorData: unknown;
    let errorMessage = `HTTP error ${response.status}: ${response.statusText}`;

    try {
      errorData = await response.json();
      if (
        errorData &&
        typeof errorData === 'object' &&
        'message' in errorData &&
        typeof (errorData as { message: unknown }).message === 'string'
      ) {
        errorMessage = (errorData as { message: string }).message;
      }
    } catch {
      try {
        const text = await response.text();
        if (text) errorMessage = text;
      } catch {
        // use default errorMessage
      }
    }

    throw new ApiError(response.status, errorMessage, errorData);
  }

  const data = (await response.json()) as T;
  return data;
}
