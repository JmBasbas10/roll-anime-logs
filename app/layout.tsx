import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rollwatch — Roblox Player Operations",
  description: "A secure operations dashboard for Roblox player data, gifts, purchases, progression, and account risk.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
