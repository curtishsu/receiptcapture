import "./globals.css";
import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  applicationName: "foodprint",
  title: "foodprint",
  description: "Track grocery receipts, corrections, and spend trends.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "foodprint"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    apple: "/apple-icon"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f766e"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
