import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/playfair-display/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asistente",
  // Toda la app está en español: el traductor de Chrome reescribe el texto de la página y, cuando React
  // agrega algo después (la respuesta de la asistente), la página se cae.
  other: { google: "notranslate" },
  description: "Asistente IA para corredores inmobiliarios",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" translate="no">
      <body>{children}</body>
    </html>
  );
}
