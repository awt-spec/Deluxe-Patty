import type { Dependencias } from "../asistente/contexto";
import type { Corredor } from "../datos/tipos";
import { fotosPropias } from "../fotos/origen";
import { generarFicha } from "./generar";

export type FichaLista =
  | { tipo: "pdf"; url: string; nombreArchivo: string; leyenda: string }
  | { tipo: "mensaje"; texto: string };

/** Genera la ficha PDF de una propiedad del corredor y la sube al bucket público "fichas". */
export async function fichaDePropiedad(deps: Dependencias, corredor: Corredor, codigo: string): Promise<FichaLista> {
  if (!corredor.marca) {
    return { tipo: "mensaje", texto: "Todavía no está configurada tu identidad visual para las fichas." };
  }
  const propiedad = await deps.repo.propiedadPorCodigo(corredor.id, codigo);
  if (!propiedad) {
    return { tipo: "mensaje", texto: `No encontré una propiedad con el código ${codigo}.` };
  }
  const pdf = await generarFicha({
    // Solo fotos del bucket propio: el generador de PDF descarga cada URL.
    propiedad: { ...propiedad, fotos: fotosPropias(propiedad.fotos, corredor.id) },
    marca: corredor.marca,
    whatsappAsistente: corredor.whatsapp_numero,
  });
  const url = await deps.repo.subirArchivo(
    corredor.id,
    "fichas",
    `${propiedad.id}/ficha-${propiedad.codigo.replace(/[^A-Za-z0-9-]/g, "")}-${Date.now()}.pdf`,
    pdf,
    "application/pdf",
  );
  return {
    tipo: "pdf",
    url,
    nombreArchivo: `Ficha ${propiedad.codigo} · ${corredor.marca.nombre}.pdf`,
    leyenda: `Ficha de ${propiedad.titulo}. Revísala antes de compartirla.`,
  };
}
