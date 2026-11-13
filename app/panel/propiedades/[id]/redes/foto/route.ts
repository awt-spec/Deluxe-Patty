import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import type { Foto } from "@/lib/datos/tipos";
import type { Marca } from "@/lib/fichas/marca";
import { fotosPropias } from "@/lib/fotos/origen";
import { rutaDeMarca } from "@/lib/marcas/archivo";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { fotosParaRedes, opcionesDeFoto } from "@/lib/redes/fotos";

// Fotos y logo para el editor de video, desde el mismo origen del panel: el lienzo (canvas) del navegador
// no deja grabar imágenes de otro sitio que no mande CORS. Solo sirve fotos de esta casa del corredor de la
// sesión, que salen del bucket propio (lib/fotos/origen.ts) o, en la demo, de Unsplash; nunca otra URL.
// ?img=<url de una foto de la casa> o ?logo=1.

export const maxDuration = 30;
const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_LOGO: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, corredor } = await sesionConCorredor();

  if (req.nextUrl.searchParams.get("logo")) {
    const logo = (corredor as { marca?: Marca | null }).marca?.logoSobreProfundo;
    const archivo = logo ? rutaDeMarca(logo) : null;
    const tipo = archivo ? TIPOS_LOGO[path.extname(archivo).toLowerCase()] : undefined;
    if (!archivo || !tipo) return new NextResponse(null, { status: 404 });
    try {
      return new NextResponse(new Uint8Array(await readFile(archivo)), { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=3600" } });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  const { data } = await supabase.from("propiedades").select("id, fotos").eq("corredor_id", corredor.id).eq("id", id).maybeSingle();
  if (!data) return new NextResponse(null, { status: 404 });
  const pedida = req.nextUrl.searchParams.get("img");
  const opcion = opcionesDeFoto(fotosParaRedes((data.fotos ?? []) as Foto[], corredor, fotosPropias)).find((o) => o.url === pedida);
  if (!opcion) return new NextResponse(null, { status: 404 });
  try {
    const r = await fetch(opcion.url, { redirect: "error" });
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0];
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(tipo)) return new NextResponse(null, { status: 502 });
    const datos = await r.arrayBuffer();
    if (datos.byteLength > MAX_BYTES) return new NextResponse(null, { status: 413 });
    return new NextResponse(datos, { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
