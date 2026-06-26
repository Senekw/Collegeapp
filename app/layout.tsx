import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spike Engine — College Application Strategy",
  description:
    "Honest, skeptical scoring of a student's real accomplishments; spike synthesis; base-rate-anchored school realism; verified-only opportunities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
