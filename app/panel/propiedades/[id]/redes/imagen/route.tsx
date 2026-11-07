import { NextResponse, type NextRequest } from "next/server";
import type { Foto, Propiedad } from "@/lib/datos/tipos";
import type { Marca } from "@/lib/fichas/marca";
import { fotosPropias } from "@/lib/fotos/origen";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { telefonoBonito } from "@/lib/crm/perfil";
import { opcionesDeFoto } from "@/lib/redes/fotos";
import { imagenRedes } from "@/lib/redes/imagen";
import type { Formato } from "@/lib/redes/texto";

// Imagen para redes de una casa del corredor de la sesión (PNG). ?formato=cuadrado|historia,
// ?img=<una foto de la casa> y ?descargar=1 para bajarla.

export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("propiedades")
    .select("id, codigo, titulo, operacion, tipo, precio, moneda, zona, canton, habitaciones, banos, m2_construccion, m2_terreno, fotos")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) return new NextResponse(null, { status: 404 });
  const p = data as Propiedad & { fotos: Foto[] };
  const opciones = opcionesDeFoto(fotosPropias(p.fotos ?? [], corredor.id));
  if (opciones.length === 0) return new NextResponse("La casa no tiene fotos.", { status: 404 });
  const pedida = req.nextUrl.searchParams.get("img");
  const elegida = opciones.find((o) => o.url === pedida) ?? opciones[0];
  const formato: Formato = req.nextUrl.searchParams.get("formato") === "historia" ? "historia" : "cuadrado";

  const imagen = await imagenRedes({
    propiedad: p,
    foto: elegida.url,
    ilustrativa: elegida.ilustrativa,
    formato,
    marca: (corredor as { marca?: Marca | null }).marca ?? null,
    nombreCorredor: corredor.nombre,
    contacto: corredor.whatsapp_numero ? telefonoBonito(corredor.whatsapp_numero) : null,
  });
  const cabeceras = new Headers(imagen.headers);
  cabeceras.set("Cache-Control", "private, no-store");
  if (req.nextUrl.searchParams.get("descargar")) {
    cabeceras.set("Content-Disposition", `attachment; filename="${p.codigo}-${formato}.png"`);
  }
  return new NextResponse(imagen.body, { status: 200, headers: cabeceras });
}
