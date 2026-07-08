export interface SafeJsonResult {
  success: boolean;
  message?: string;
  raw?: string;
  [key: string]: any;
}

/**
 * Safely parses a fetch Response body as JSON, never throwing. Use this
 * instead of `response.json()` directly whenever an API route might return an
 * empty body (e.g. a stray 204) or a non-JSON error page — calling
 * `response.json()` on either throws "Unexpected end of JSON input" and
 * crashes the calling code before it ever reaches error handling.
 */
export async function parseJsonSafe(response: Response): Promise<SafeJsonResult> {
  const text = await response.text();

  if (!text) {
    return {
      success: false,
      message: 'Server tidak mengembalikan response.',
    };
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      message: 'Response server bukan JSON valid.',
      raw: text,
    };
  }
}
