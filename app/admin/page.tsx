import { sesionSuperadmin } from "@/lib/admin/superadmin";
import { listaAtencion } from "@/lib/admin/atencion";
import { cargarCorredores, llavesWhatsApp } from "@/lib/admin/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { Mensaje } from "./ui";
import { VistaResumen } from "./vistas/resumen";

// Resumen: lo primero que se ve. Cifras del mes, lo que pide atención (lo que falta o se está pasando) y las
// últimas alertas de monitoreo. Esta página solo lee; lo que se ve está en vistas/resumen.tsx.

export default async function Resumen({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string }> }) {
  // Cada página comprueba al superadmin por su cuenta (no solo el layout): sin serlo, 404.
  await sesionSuperadmin();
  const { m, ok } = await searchParams;
  const db = createAdminClient();
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ filas }, { data: alertas }, { count }] = await Promise.all([
    cargarCorredores(db),
    db
      .from("alertas")
      .select("clave, enviada_at")
      // Marcas internas de la extensión (frenos y fechas de búsqueda), no alertas de monitoreo.
      .not("clave", "like", "leer_anuncio:%")
      .not("clave", "like", "busqueda_hecha:%")
      .not("clave", "like", "busqueda_auto:%")
      .order("enviada_at", { ascending: false })
      .limit(8),
    db
      .from("alertas")
      .select("clave", { count: "exact", head: true })
      .not("clave", "like", "leer_anuncio:%")
      .not("clave", "like", "busqueda_hecha:%")
      .not("clave", "like", "busqueda_auto:%")
      .gte("enviada_at", desde),
  ]);

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <VistaResumen
        filas={filas}
        atencion={listaAtencion(filas, llavesWhatsApp())}
        alertas={(alertas ?? []).map((a) => ({ clave: String(a.clave), enviada_at: String(a.enviada_at) }))}
        alertas24h={count ?? 0}
      />
    </>
  );
}
