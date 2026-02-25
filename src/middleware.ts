import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const locales = ['id', 'en'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check if the pathname starts with a locale
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    // Clone the URL
    const newUrl = req.nextUrl.clone();
    
    // Get the locale and the rest of the path
    const pathSegments = pathname.split('/');
    const locale = pathSegments[1];
    const newPathname = pathname.replace(`/${locale}`, '');
    
    newUrl.pathname = newPathname === '' ? '/' : newPathname;
    
    // Redirect to the new URL
    return NextResponse.redirect(newUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Do not run the middleware on API routes, Next.js build files, or static files
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
