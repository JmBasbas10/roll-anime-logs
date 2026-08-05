import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rollwatch - Roblox Player Operations",
  description: "A secure operations dashboard for Roblox player data, gifts, purchases, progression, and account risk.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-bs-theme="dark"><head><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" /></head><body>{children}</body></html>;
}

