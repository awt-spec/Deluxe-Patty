import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Asistente",
  description: "Asistente IA para corredores inmobiliarios",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
