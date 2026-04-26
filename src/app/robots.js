const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.gr';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/landlord/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
