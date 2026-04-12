import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Receipt Tracker",
  description: "Track grocery receipts, corrections, and spend trends."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
