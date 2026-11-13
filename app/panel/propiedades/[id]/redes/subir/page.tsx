import { notFound } from "next/navigation";
import type { Propiedad } from "@/lib/datos/tipos";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { textoPublicacion } from "@/lib/redes/texto";
import { EncabezadoPagina } from "../../../../piezas";
import { GuiaSubir } from "./guia";

// "¿Cómo lo subo?": después de descargar el video de redes, la guía para subirlo a Instagram, WhatsApp o TikTok con
// el mismo texto de la pestaña Texto (textoPublicacion, armado por código desde la ficha).
export default async function SubirVideo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("propiedades")
    .select("id, codigo, titulo, operacion, tipo, precio, moneda, zona, canton, habitaciones, banos, m2_construccion, m2_terreno, amenidades")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as Propiedad;
  const texto = textoPublicacion(p, { nombre: corredor.nombre_contacto, whatsapp: corredor.whatsapp_numero });
  return (
    <div className="pasos-pagina">
      <EncabezadoPagina
        titulo="Subir el video"
        apoyo={`${p.titulo}: a Instagram, WhatsApp o TikTok desde tu teléfono.`}
        atras={{ href: `/panel/propiedades/${p.id}/redes?ver=video`, texto: "Video para redes" }}
      />
      <GuiaSubir propiedadId={p.id} texto={texto} />
    </div>
  );
}
