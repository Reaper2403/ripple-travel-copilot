import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ripple — Executive scheduling assistant",
  description: "Understand schedule pressure, explore practical options, and act only after exact confirmation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
