import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  // Do not run the middleware on API routes, Next.js build files, or static files
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
