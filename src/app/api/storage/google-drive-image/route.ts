import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy endpoint untuk Google Drive images.
 * Accepts fileId, calls Apps Script action=image,
 * handles both JSON {success, base64, mimeType} and raw base64 responses,
 * returns raw image bytes.
 */
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId');

  if (!fileId) {
    return new NextResponse('Missing fileId', { status: 400 });
  }

  const appsScriptUrl = process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL;
  const uploadSecret = process.env.GOOGLE_DRIVE_UPLOAD_SECRET;

  if (!appsScriptUrl || !uploadSecret) {
    return new NextResponse('Server not configured for image proxy', { status: 500 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let responseText: string;
  try {
    const params = new URLSearchParams({ action: 'image', fileId, secret: uploadSecret });
    const appsScriptResponse = await fetch(`${appsScriptUrl}?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!appsScriptResponse.ok) {
      clearTimeout(timeout);
      return new NextResponse(`Apps Script responded with ${appsScriptResponse.status}`, { status: 502 });
    }

    responseText = await appsScriptResponse.text();
  } catch (err: any) {
    clearTimeout(timeout);
    console.error('Google Drive image proxy fetch error:', err);
    return new NextResponse('Failed to fetch from Apps Script', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  // Try to parse as JSON first — Apps Script may return {success, base64, mimeType}
  // or raw base64 text directly (older/alternate deployments)
  let base64: string;
  let mimeType = 'image/png';

  let payload: any = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }

  if (payload !== null) {
    // JSON response
    if (!payload.success) {
      console.error('Apps Script error response:', payload.error || 'unknown');
      return new NextResponse(payload.error || 'Image not available', { status: 404 });
    }
    base64 = payload.base64 as string;
    mimeType = payload.mimeType || 'image/png';
  } else {
    // Raw base64 text (e.g. iVBORw0KGgo...)
    base64 = responseText.trim();
  }

  // Strip data URL prefix if present (e.g. "data:image/png;base64,...")
  if (base64.includes(',')) {
    base64 = base64.split(',')[1];
  }

  const buffer = Buffer.from(base64, 'base64');

  return new Response(buffer, {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
