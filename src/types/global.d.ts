// Ambient module declaration for plain CSS side-effect imports (e.g.
// `import 'leaflet/dist/leaflet.css'`, `import './globals.css'`). Next.js's
// build pipeline (SWC/webpack) already handles these at build time without
// needing this, but a standalone `tsc`/IDE language server type-checking the
// project directly has no type information for `.css` files otherwise —
// this is what TS2882 ("Cannot find module or type declarations for
// side-effect import") flags. No CSS Modules (`*.module.css`) are used in
// this repo, so a bare untyped module declaration is sufficient.
declare module '*.css';
