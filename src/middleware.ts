import createMiddleware from 'next-intl/middleware';
 
export default createMiddleware({
  locales: ['id', 'en'],
  defaultLocale: 'id',
  localePrefix: 'as-needed'
});
 
export const config = {
  // Skip all paths that should not be internationalized.
  // This is the key change to fix the 404 on /admin routes.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|admin).*)']
};
