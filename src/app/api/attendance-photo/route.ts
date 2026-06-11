import { NextRequest, NextResponse } from "next/server";

/**
 * API proxy untuk mengambil foto bukti absensi dari Google Drive
 * GET /api/attendance-photo?fileId=DRIVE_FILE_ID
 *
 * Flow:
 * 1. HRP menerima fileId
 * 2. HRP fetch langsung dari Google Drive dengan fallback URLs
 * 3. Return image/jpeg buffer ke browser
 *
 * Fallback URLs (in priority order):
 * 1. https://drive.google.com/thumbnail?id={fileId}&sz=w1000
 * 2. https://drive.google.com/uc?export=view&id={fileId}
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json(
        { error: "Missing fileId parameter" },
        { status: 400 }
      );
    }

    // Validate fileId format (basic validation)
    if (!/^[a-zA-Z0-9-_]+$/.test(fileId)) {
      return NextResponse.json(
        { error: "Invalid fileId format" },
        { status: 400 }
      );
    }

    const DEBUG = true; // Enable debug logging temporarily
    const logPrefix = `[AttendancePhoto/${fileId.substring(0, 8)}]`;

    if (DEBUG) console.log(`${logPrefix} Processing request`);

    // Try multiple Google Drive URLs for image retrieval
    // Priority 1: Thumbnail (faster, lower quality but sufficient for verification)
    // Priority 2: View/Export (full quality)
    const googleDriveUrls = [
      {
        name: "thumbnail",
        url: `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`,
      },
      {
        name: "view_export",
        url: `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
      },
    ];

    let lastError: Error | null = null;

    for (const { name, url } of googleDriveUrls) {
      try {
        if (DEBUG) console.log(`${logPrefix} Attempting ${name}: ${url.substring(0, 80)}...`);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          cache: "no-store",
          redirect: "follow",
        });

        if (DEBUG) {
          console.log(`${logPrefix} ${name} response status: ${response.status}`);
          console.log(`${logPrefix} ${name} content-type: ${response.headers.get("content-type")}`);
          console.log(`${logPrefix} ${name} content-length: ${response.headers.get("content-length")}`);
        }

        // Check if response is successful
        if (!response.ok) {
          if (DEBUG) console.log(`${logPrefix} ${name} failed with status ${response.status}`);
          lastError = new Error(`Google Drive ${name} returned ${response.status}`);
          continue;
        }

        // Get content-type from response
        const contentType = response.headers.get("content-type") || "image/jpeg";

        // Check if it's actually an image
        if (!contentType.startsWith("image/")) {
          if (DEBUG) console.log(`${logPrefix} ${name} returned non-image: ${contentType}`);
          lastError = new Error(`Expected image, got ${contentType}`);
          continue;
        }

        // Get response as array buffer
        const buffer = await response.arrayBuffer();

        // Validate buffer size (must be more than 100 bytes for a real image)
        if (buffer.byteLength < 100) {
          if (DEBUG) console.log(`${logPrefix} ${name} buffer too small: ${buffer.byteLength} bytes`);
          lastError = new Error(`Image buffer too small: ${buffer.byteLength} bytes`);
          continue;
        }

        if (DEBUG) {
          console.log(`${logPrefix} SUCCESS using ${name}`);
          console.log(`${logPrefix} Buffer size: ${buffer.byteLength} bytes`);
          console.log(`${logPrefix} Content-Type: ${contentType}`);
        }

        // Return image with proper headers
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Length": buffer.byteLength.toString(),
            "Cache-Control": "private, max-age=3600", // Cache for 1 hour (image won't change)
            "X-Content-Type-Options": "nosniff",
            "X-Source": name,
          },
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (DEBUG) console.error(`${logPrefix} ${name} error:`, lastError.message);
        // Continue to next URL
      }
    }

    // All URLs failed
    if (DEBUG) {
      console.error(`${logPrefix} All Google Drive URLs failed`);
      console.error(`${logPrefix} Last error: ${lastError?.message}`);
    }

    return NextResponse.json(
      {
        error: "Failed to fetch image from Google Drive",
        details: lastError?.message || "No fallback URLs succeeded",
        fileId: fileId,
      },
      { status: 500 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[AttendancePhoto] Unexpected error:", errorMsg);
    return NextResponse.json(
      {
        error: "Failed to fetch attendance photo",
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}

// Disable body parser since we only handle GET requests
export const config = {
  api: {
    bodyParser: false,
  },
};
