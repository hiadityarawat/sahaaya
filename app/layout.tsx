import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./fixes.css";
import "./brand.css";
import PwaInstall from "./PwaInstall";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sahaaya-disaster-response.hi-aditya-rawat.chatgpt.site"),
  title: "Sahaaya — Community Help Network",
  description: "Request emergency help or offer food, medical support, shelter, transport, and essential supplies to people nearby.",
  applicationName: "Sahaaya",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sahaaya",
  },
  formatDetection: {
    telephone: true,
  },
  openGraph: {
    type: "website",
    title: "Sahaaya — Community Help Network",
    description: "Request emergency help and coordinate trusted community support across devices.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Sahaaya Community Help Network" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sahaaya — Community Help Network",
    description: "Request emergency help and coordinate trusted community support across devices.",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/sahaaya-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: [{ url: "/icons/sahaaya-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#123d33" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <PwaInstall />
      </body>
    </html>
  );
}
