import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CALICAS 2026 — Quiniela Mundial",
  description: "Quiniela del Mundial FIFA 2026 entre amigos. Hecho con cariño rojiamarillo.",
  applicationName: "CALICAS 2026",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#E40521",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
