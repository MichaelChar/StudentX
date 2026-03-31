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

export const metadata = {
  title: {
    default: "StudentX — Student Housing in Thessaloniki",
    template: "%s — StudentX",
  },
  description:
    "Find student housing near your university in Thessaloniki. Curated listings by price, location, and distance to campus.",
  openGraph: {
    title: "StudentX — Student Housing in Thessaloniki",
    description:
      "Find student housing near your university in Thessaloniki. Curated listings by price, location, and distance to campus.",
    siteName: "StudentX",
    type: "website",
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
