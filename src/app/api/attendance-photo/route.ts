import { NextRequest, NextResponse } from "next/server";

/**
 * API proxy untuk mengambil foto bukti absensi dari Google Drive via Apps Script
 * GET /api/attendance-photo?fileId=DRIVE_FILE_ID
 *
 * Flow:
 * 1. HRP menerima fileId
 * 2. HRP memanggil Apps Script dengan action=image&fileId=...&secret=...
 * 3. Apps Script ambil file dari Google Drive, return base64
 * 4. HRP convert base64 ke Buffer dan return sebagai image
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

    // Get Apps Script URL dan secret dari environment
    const scriptUrl = process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL;
    const secret = process.env.GOOGLE_DRIVE_UPLOAD_SECRET;

    if (!scriptUrl || !secret) {
      console.error("Missing Google Drive Apps Script environment variables");
      return NextResponse.json(
        {
          error:
            "Server configuration error: Google Drive Apps Script not configured",
        },
        { status: 500 }
      );
    }

    // Call Apps Script dengan action=image untuk ambil file
    const appsScriptUrl = `${scriptUrl}?action=image&fileId=${encodeURIComponent(
      fileId
    )}&secret=${encodeURIComponent(secret)}`;

    console.log(`[AttendancePhoto] Fetching from Apps Script: ${scriptUrl}`);

    const response = await fetch(appsScriptUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent": "HRP-AttendancePhotoProxy/1.0",
      },
    });

    if (!response.ok) {
      console.error(
        `[AttendancePhoto] Apps Script returned status ${response.status}`
      );
      return NextResponse.json(
        { error: "Failed to fetch image from Google Drive" },
        { status: response.status }
      );
    }

    const base64Text = await response.text();

    if (!base64Text || base64Text.length === 0) {
      console.error("[AttendancePhoto] Apps Script returned empty response");
      return NextResponse.json(
        { error: "Apps Script returned empty image data" },
        { status: 500 }
      );
    }

    // Check if response is an error JSON
    try {
      const jsonCheck = JSON.parse(base64Text);
      if (jsonCheck.error) {
        console.error(
          `[AttendancePhoto] Apps Script error: ${jsonCheck.error}`
        );
        return NextResponse.json(
          { error: jsonCheck.error },
          { status: 400 }
        );
      }
    } catch {
      // Not JSON, so it's probably base64 image data - continue
    }

    // Convert base64 to Buffer
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Text, "base64");
    } catch (error) {
      console.error("[AttendancePhoto] Failed to decode base64:", error);
      return NextResponse.json(
        { error: "Invalid image data from Google Drive" },
        { status: 500 }
      );
    }

    // Return image with proper headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=300", // Cache for 5 minutes
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[AttendancePhoto] Unexpected error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch attendance photo",
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
