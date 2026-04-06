import { Inter, Montserrat } from "next/font/google";
import { getLocale } from "next-intl/server";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://studentx.gr";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    languages: {
      en: SITE_URL,
      el: `${SITE_URL}/el`,
    },
  },
};

const inter = Inter({
  subsets: ["latin", "greek"],
  variable: "--font-inter",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["600", "700"],
  display: "swap",
});

export default async function RootLayout({ children }) {
  const locale = await getLocale().catch(() => 'el');
  return (
    <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
