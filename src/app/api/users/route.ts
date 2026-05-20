import { NextRequest, NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "User creation is no longer supported on this endpoint. Use /api/admin/users instead.",
    },
    { status: 405 },
  );
}
