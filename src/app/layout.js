import { Inter, Montserrat } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["600", "700"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://studentx.gr";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "StudentX — Φοιτητικές Κατοικίες Θεσσαλονίκη",
    template: "%s — StudentX",
  },
  description:
    "Βρες φοιτητική κατοικία κοντά στο πανεπιστήμιό σου στη Θεσσαλονίκη. Επιλεγμένες αγγελίες με τιμή, τοποθεσία και απόσταση από σχολή. | Find student housing near your university in Thessaloniki.",
  keywords: [
    "φοιτητικά σπίτια Θεσσαλονίκη",
    "φοιτητική κατοικία ΑΠΘ",
    "ενοικίαση φοιτητές Θεσσαλονίκη",
    "student housing Thessaloniki",
    "student accommodation AUTH",
    "rent near university Thessaloniki",
    "φοιτητικά ενοίκια",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "StudentX — Φοιτητικές Κατοικίες Θεσσαλονίκη",
    description:
      "Βρες φοιτητική κατοικία κοντά στο πανεπιστήμιό σου στη Θεσσαλονίκη. | Find student housing near your university in Thessaloniki.",
    siteName: "StudentX",
    type: "website",
    url: SITE_URL,
    locale: "el_GR",
  },
  twitter: {
    card: "summary_large_image",
    title: "StudentX — Student Housing in Thessaloniki",
    description:
      "Find student housing near your university in Thessaloniki. Curated listings by price, location, and distance to campus.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
