/**
 * Fetch Utilities with proper error handling
 */

import type { ApiResponse } from '@/types/api';

export class FetchError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Fetch wrapper with response validation
 * Throws FetchError if response is not ok
 */
export async function fetchJson<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new FetchError(
      `HTTP ${response.status}: ${errorText}`,
      response.status,
      response.statusText
    );
  }

  return response.json();
}

/**
 * SWR fetcher with validation
 */
export const swrFetcher = async <T = unknown>(url: string): Promise<T> => {
  return fetchJson<T>(url);
};

/**
 * Type guard for API responses
 */
export function isApiError(response: ApiResponse): response is ApiResponse & { success: false; error: string } {
  return !response.success && typeof response.error === 'string';
}

/**
 * Parse API response and throw on error
 */
export function assertApiSuccess<T extends ApiResponse>(response: T): asserts response is T & { success: true } {
  if (!response.success) {
    throw new Error(response.error || 'API request failed');
  }
}
