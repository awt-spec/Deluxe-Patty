import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { logoDeCorredor } from "@/lib/panel/marca";

// Logo de un corredor para la pantalla de entrada. Si es un archivo de marcas/ se sirve desde aquí;
// si es una URL, se redirige a ella. Nunca lee nada fuera de marcas/.
const TIPOS: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const logo = await logoDeCorredor(slug).catch(() => null);
  if (!logo) return new NextResponse(null, { status: 404 });
  if (/^https:\/\//.test(logo)) return NextResponse.redirect(logo);

  const raiz = path.join(process.cwd(), "marcas");
  const archivo = path.resolve(process.cwd(), logo);
  const tipo = TIPOS[path.extname(archivo).toLowerCase()];
  if (!archivo.startsWith(raiz + path.sep) || !tipo) return new NextResponse(null, { status: 404 });
  try {
    const datos = await readFile(archivo);
    return new NextResponse(new Uint8Array(datos), {
      headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
