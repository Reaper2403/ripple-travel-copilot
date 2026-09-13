import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ripple — Travel disruption recovery",
  description: "Understand what changed, coordinate the consequences, and recover safely.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
