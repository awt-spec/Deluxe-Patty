import { dentroDelTope } from "../asistente/limites";
import type { Dependencias } from "../asistente/contexto";
import type { Corredor, Foto, VarianteFoto } from "../datos/tipos";
import { ESTILOS, type EstiloAmueblado, type ImagenIA } from "./editor";
import { esFotoPropia } from "./origen";

// Versiones ilustrativas de una foto, hechas con IA: el cuarto amueblado o la foto sin objetos que
// estorban. Se guardan aparte en la foto (fotos[i].variantes); la original y la mejorada no se tocan,
// y el panel las muestra marcadas como ilustrativas para que el corredor lo diga al publicarlas.

const TIPOS = /^image\/(jpeg|png|webp)$/;
/** Variantes que se guardan por foto (las más nuevas). */
export const MAX_VARIANTES = 6;

export type PedidoVariante = { tipo: "amueblada"; estilo: EstiloAmueblado; cuarto?: string } | { tipo: "limpia"; queQuitar: string };

export type ResultadoVariante = { ok: true; url: string } | { ok: false; motivo: string };

/** Si el corredor puede usar imágenes con IA ahora (configuradas, permitidas y dentro del tope). */
export async function puedeUsarImagenes(deps: Dependencias, corredor: Corredor): Promise<string | null> {
  if (!deps.fotos) return "Las imágenes con IA todavía no están configuradas.";
  if (corredor.activo === false) return "En la demo no se generan imágenes.";
  if (corredor.imagenes_activas === false) return "Las imágenes con IA están apagadas para tu cuenta. Escríbele a soporte.";
  if (!dentroDelTope(await deps.repo.presupuestoIA(corredor.id))) {
    return "Se llegó al límite de gasto de inteligencia artificial. Vuelve a funcionar mañana o escríbele a soporte.";
  }
  return null;
}

export async function crearVariante(
  deps: Dependencias,
  corredor: Corredor,
  propiedadId: string,
  fotos: Foto[],
  urlFoto: string,
  pedido: PedidoVariante,
): Promise<ResultadoVariante> {
  const bloqueo = await puedeUsarImagenes(deps, corredor);
  if (bloqueo) return { ok: false, motivo: bloqueo };
  const foto = fotos.find((f) => f.url === urlFoto);
  if (!foto || !esFotoPropia(foto.url, corredor.id)) return { ok: false, motivo: "No encontré esa foto." };
  if (pedido.tipo === "limpia" && !pedido.queQuitar.trim()) return { ok: false, motivo: "Escribe qué quieres quitar de la foto." };
  if (pedido.tipo === "amueblada" && !(pedido.estilo in ESTILOS)) return { ok: false, motivo: "Elige un estilo." };

  // Se parte de la mejorada si la hay (mejor luz), si no de la original.
  const base = foto.mejorada_url && esFotoPropia(foto.mejorada_url, corredor.id) ? foto.mejorada_url : foto.url;
  const descarga = await fetch(base);
  const tipo = (descarga.headers.get("content-type") ?? "").split(";")[0];
  if (!descarga.ok || !TIPOS.test(tipo)) return { ok: false, motivo: "No pude abrir la foto. Inténtalo de nuevo." };
  const imagen = Buffer.from(await descarga.arrayBuffer());

  const editor = deps.fotos!;
  let resultado: ImagenIA;
  try {
    resultado =
      pedido.tipo === "amueblada"
        ? await editor.amueblar(imagen, tipo, pedido.estilo, pedido.cuarto)
        : await editor.limpiar(imagen, tipo, pedido.queQuitar);
  } catch (e) {
    const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
    log("error_imagen", { corredorId: corredor.id, propiedadId, tipo: pedido.tipo, error: e instanceof Error ? e.name : "desconocido" });
    return { ok: false, motivo: "No pude hacer la imagen ahora. Inténtalo de nuevo en un rato." };
  }
  await deps.repo.registrarImagenes(corredor.id, 1, resultado.costoUsd);

  const numero = fotos.indexOf(foto) + 1;
  const url = await deps.repo.subirArchivo(corredor.id, "fotos", `${propiedadId}/${numero}-${pedido.tipo}-${Date.now()}.jpg`, resultado.imagen, "image/jpeg");
  const variante: VarianteFoto = {
    tipo: pedido.tipo,
    url,
    detalle: pedido.tipo === "amueblada" ? `Estilo ${pedido.estilo}` : `Sin: ${pedido.queQuitar.trim().slice(0, 120)}`,
    creada_at: new Date().toISOString(),
  };
  foto.variantes = [variante, ...(foto.variantes ?? [])].slice(0, MAX_VARIANTES);
  await deps.repo.guardarFotos(corredor.id, propiedadId, fotos);
  return { ok: true, url };
}

/** Quita una variante de una foto (el archivo queda en el bucket; ya no se muestra). */
export function sinVariante(fotos: Foto[], urlFoto: string, urlVariante: string): boolean {
  const foto = fotos.find((f) => f.url === urlFoto);
  if (!foto?.variantes?.some((v) => v.url === urlVariante)) return false;
  foto.variantes = foto.variantes.filter((v) => v.url !== urlVariante);
  return true;
}
