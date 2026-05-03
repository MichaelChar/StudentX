import { EB_Garamond, Source_Sans_3 } from "next/font/google";
import { getLocale } from "next-intl/server";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://studentx.uk";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    languages: {
      el: SITE_URL,
      en: `${SITE_URL}/en`,
    },
  },
};

// Propylaea display face — EB Garamond (Greek polytonic coverage)
const ebGaramond = EB_Garamond({
  subsets: ["latin", "greek"],
  variable: "--font-eb-garamond",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

// Propylaea body/UI face — Source Sans 3 (wide x-height, Greek polytonic coverage)
const sourceSans = Source_Sans_3({
  subsets: ["latin", "greek"],
  variable: "--font-source-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default async function RootLayout({ children }) {
  const locale = await getLocale().catch(() => "el");
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${ebGaramond.variable} ${sourceSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-stone text-night">
        {children}
      </body>
    </html>
  );
}
