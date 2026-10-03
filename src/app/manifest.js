/*
  Web app manifest (/manifest.webmanifest) — makes "Add to Home Screen" open
  StudentX as a standalone app with its own icon, instead of a screenshot icon
  and a browser frame (polish plan UI-14).

  Theme and background are white to match the header, so the installed app's
  title bar and launch screen read as part of the page. Icons come from
  scripts/app-icons.mjs; the maskable one keeps the mark inside the 80% safe
  zone Android may crop to.
*/
export default function manifest() {
  return {
    name: 'StudentX',
    short_name: 'StudentX',
    description: 'Browse student services by city.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
