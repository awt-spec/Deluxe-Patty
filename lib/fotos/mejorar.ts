import type { Dependencias } from "../asistente/contexto";
import type { Corredor } from "../datos/tipos";
import { esFotoPropia } from "./origen";

export const MAX_FOTOS = 12;
const EN_PARALELO = 3;
const TIPOS = /^image\/(jpeg|png|webp)$/;
/** Costo que se reserva por imagen en curso mientras no se sabe el real (el mismo valor por defecto que `editor.ts`). */
function costoEstimado(): number {
  const v = Number(process.env.OPENAI_COSTO_IMAGEN_USD);
  return Number.isFinite(v) && v > 0 ? v : 0.25;
}

export interface FotoMejorada {
  numero: number;
  url: string;
}

export interface ResultadoFotos {
  mensajes: string[];
  mejoradas: FotoMejorada[];
  fallidas: number;
}

async function enParalelo<T, R>(items: T[], limite: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, items.length) }, async () => {
      while (siguiente < items.length) {
        const i = siguiente++;
        res[i] = await fn(items[i], i);
      }
    }),
  );
  return res;
}

/**
 * Mejora hasta 12 fotos de una propiedad con IA. Guarda cada versión mejorada junto a la original
 * (propiedades.fotos[i].mejorada_url); la original nunca se reemplaza.
 */
export async function mejorarFotos(
  deps: Dependencias,
  corredor: Corredor,
  codigo: string,
  avisar: (texto: string) => Promise<unknown>,
  /** Solo esta foto (por su URL original), por ejemplo desde la imagen para redes. */
  soloUrl?: string,
): Promise<ResultadoFotos> {
  const editor = deps.fotos;
  if (!editor) {
    return { mensajes: ["La mejora de fotos todavía no está configurada."], mejoradas: [], fallidas: 0 };
  }
  const propiedad = await deps.repo.propiedadPorCodigo(corredor.id, codigo);
  if (!propiedad) {
    return { mensajes: [`No encontré una propiedad con el código ${codigo}.`], mejoradas: [], fallidas: 0 };
  }
  const fotos = [...propiedad.fotos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (fotos.length === 0) {
    return { mensajes: [`${propiedad.titulo} no tiene fotos cargadas.`], mejoradas: [], fallidas: 0 };
  }
  // Solo fotos del bucket propio y que todavía no tienen versión mejorada (no se paga dos veces).
  const aMejorar = fotos.filter((f) => (!soloUrl || f.url === soloUrl) && esFotoPropia(f.url, corredor.id) && !f.mejorada_url).slice(0, MAX_FOTOS);
  if (aMejorar.length === 0) {
    return { mensajes: [`Las fotos de ${propiedad.titulo} ya están mejoradas.`], mejoradas: [], fallidas: 0 };
  }
  await avisar(
    `Estoy mejorando ${aMejorar.length} ${aMejorar.length === 1 ? "foto" : "fotos"} de ${propiedad.titulo}. ` +
      "Te las mando en unos minutos.",
  );

  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
  // Tope de gasto con el lote en paralelo: se lee el presupuesto una vez y, antes de cada imagen, se suma lo ya
  // gastado en este lote y una reserva (costo estimado) por cada imagen en curso y por la nueva. Así el lote no se
  // pasa del tope aunque vayan 3 a la vez (como mucho, lo que una imagen cueste de más sobre la estimación). Cada costo se registra apenas se paga, para
  // que otros pedidos simultáneos lo vean.
  const presupuesto = await deps.repo.presupuestoIA(corredor.id);
  let gastado = 0;
  let enCurso = 0;
  let estimado = costoEstimado();
  let frenadas = 0;
  // Cabe una imagen más si, contando lo gastado, las que van en curso y esta, no se pasa del tope.
  const cabe = () => {
    const extra = gastado + (enCurso + 1) * estimado;
    return presupuesto.gastoDia + extra <= presupuesto.topeDia && presupuesto.gastoMes + extra <= presupuesto.topeMes;
  };
  const resultados = await enParalelo(aMejorar, EN_PARALELO, async (foto) => {
    // Número de la foto en el orden de la propiedad, para que coincida con lo que ve el corredor.
    const numero = fotos.indexOf(foto) + 1;
    if (!cabe()) {
      frenadas++;
      return null;
    }
    enCurso++;
    let pagada = false;
    try {
      const original = await fetch(foto.url);
      const tipo = (original.headers.get("content-type") ?? "").split(";")[0];
      if (!original.ok || !TIPOS.test(tipo)) throw new Error(`descarga ${original.status} ${tipo}`);
      const { imagen: mejorada, costoUsd } = await editor.mejorar(Buffer.from(await original.arrayBuffer()), tipo);
      enCurso--;
      pagada = true;
      gastado += costoUsd;
      estimado = Math.max(estimado, costoUsd);
      // Lo pagado a OpenAI suma al gasto de IA del corredor apenas se paga (también si lo de después falla).
      if (costoUsd > 0) await deps.repo.registrarImagenes(corredor.id, 0, costoUsd);
      const url = await deps.repo.subirArchivo(
        corredor.id,
        "fotos",
        `${propiedad.id}/${numero}-mejorada-${Date.now()}.jpg`,
        mejorada,
        "image/jpeg",
      );
      foto.mejorada_url = url;
      return { numero, url };
    } catch (error) {
      if (!pagada) enCurso--;
      log("error_foto", {
        corredorId: corredor.id,
        propiedadId: propiedad.id,
        foto: numero,
        error: error instanceof Error ? error.name : "desconocido",
      });
      return null;
    }
  });

  const mejoradas = resultados.filter((r): r is FotoMejorada => r !== null);
  if (mejoradas.length) {
    // Sobre las fotos de ahora: la mejora tarda minutos y el corredor pudo cambiar fotos mientras tanto.
    const nuevas = new Map(fotos.filter((f) => f.mejorada_url).map((f) => [f.url, f.mejorada_url!]));
    await deps.repo.fusionarFotos(corredor.id, propiedad.id, (actuales) =>
      actuales.map((f) => (nuevas.has(f.url) && !f.mejorada_url ? { ...f, mejorada_url: nuevas.get(f.url) } : f)),
    );
    await deps.repo.registrarFotosMejoradas(corredor.id, mejoradas.length);
  }
  // El costo ya se registró foto por foto; aquí solo se cuentan las imágenes que quedaron.
  if (mejoradas.length) await deps.repo.registrarImagenes(corredor.id, mejoradas.length, 0);
  const fallidas = aMejorar.length - mejoradas.length - frenadas;

  const cierre = mejoradas.length
    ? [
        `Listo: ${mejoradas.length} ${mejoradas.length === 1 ? "foto mejorada" : "fotos mejoradas"} de ${propiedad.titulo}` +
          (fallidas ? ` (${fallidas} no se pudieron).` : ".") +
          (frenadas ? ` Llegué al tope de gasto de IA: ${frenadas === 1 ? "queda 1 foto" : `quedan ${frenadas} fotos`} para cuando se renueve.` : ""),
        "Revísalas antes de publicarlas: la IA a veces cambia detalles. Si alguna no se ve igual a la propiedad, usa la original.",
      ].join(" ")
    : frenadas === aMejorar.length
      ? "Se llegó al límite de gasto de inteligencia artificial: no mejoré ninguna foto. Vuelve a funcionar mañana o escríbele a soporte."
      : "No pude mejorar las fotos ahora. Inténtalo de nuevo en un rato.";
  return { mensajes: [cierre], mejoradas, fallidas: fallidas + frenadas };
}
