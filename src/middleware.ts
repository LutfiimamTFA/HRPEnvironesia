import createMiddleware from 'next-intl/middleware';
 
export default createMiddleware({
  locales: ['id', 'en'],
  defaultLocale: 'id',
  localePrefix: 'as-needed'
});
 
export const config = {
  // Skip all paths that should not be internationalized, including /admin
  matcher: ['/((?!api|admin|_next/static|_next/image|favicon.ico|images).*)']
};
