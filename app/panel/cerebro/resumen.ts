import { sinTildes } from "@/lib/agenda/zonas";

// Reglas puras del Cerebro de la asistente: de qué trata cada cosa que sabe, qué cambió en una corrección,
// la frase de arriba y la lista de "Qué tan lista está". Todo lo arma el código con lo que la página ya leyó:
// nada de porcentajes ni cifras inventadas.

// --- Categoría de lo que sabe -------------------------------------------------------------------------

export type Categoria = "casas" | "pagos" | "visitas" | "zonas" | "mascotas" | "otros";

export const CATEGORIAS: { clave: Categoria; nombre: string }[] = [
  { clave: "casas", nombre: "Casas" },
  { clave: "pagos", nombre: "Pagos" },
  { clave: "visitas", nombre: "Visitas" },
  { clave: "zonas", nombre: "Zonas" },
  { clave: "mascotas", nombre: "Mascotas" },
  { clave: "otros", nombre: "Otros" },
];

// Comienzos de palabra, sin tildes. Se revisan en este orden: lo más específico primero ("¿aceptan perros en el
// apartamento?" es de mascotas, no de casas).
const PALABRAS: [Categoria, string[]][] = [
  ["mascotas", ["mascota", "perro", "perrit", "gato", "animal", "pet"]],
  [
    "pagos",
    ["pago", "pagar", "paga", "financ", "credito", "banco", "bancari", "deposito", "efectivo", "transferencia", "sinpe", "colones", "dolares", "comision", "prima", "hipoteca", "tarjeta", "cuota", "reserva", "contado", "descuento", "precio"],
  ],
  ["visitas", ["visita", "visitar", "cita", "horario", "hora", "agendar", "agenda", "llave", "mostrar", "ensenar la", "fin de semana", "sabado", "domingo", "feriado"]],
  ["zonas", ["zona", "ubicacion", "barrio", "queda", "donde", "cerca", "distancia", "colegio", "escuela", "escazu", "santa ana", "lindora", "heredia", "cartago", "alajuela", "guanacaste", "playa"]],
  [
    "casas",
    ["casa", "apartamento", "apto", "condominio", "propiedad", "parqueo", "cochera", "cuarto", "habitacion", "bano", "piscina", "metro", "lote", "terreno", "amueblad", "jardin", "cocina", "bodega", "vista", "construccion", "alquiler"],
  ],
];

const REGLAS = PALABRAS.map(([c, ps]) => [c, new RegExp(`(^|[^a-z0-9])(${ps.join("|")})`)] as const);

/** De qué trata un tema, por sus palabras: casas, pagos, visitas, zonas, mascotas u otros. */
export function categoriaDeTema(tema: string, respuesta?: string | null): Categoria {
  const t = sinTildes(tema);
  for (const [c, r] of REGLAS) if (r.test(t)) return c;
  // Si el tema no dice nada, la respuesta puede decirlo.
  if (respuesta) {
    const s = sinTildes(respuesta);
    for (const [c, r] of REGLAS) if (r.test(s)) return c;
  }
  return "otros";
}

// --- Qué cambió en una corrección ---------------------------------------------------------------------

export type Parte = { texto: string; cambio: boolean };

const MAX_CELDAS = 160_000;

/** Palabras y espacios por separado, para que el resaltado respete el texto original. */
function trozos(t: string): string[] {
  return t.match(/\s+|[^\s]+/g) ?? [];
}

const clave = (p: string) => sinTildes(p).replace(/^[¿¡"«(]+|[.,;:!?"»)]+$/g, "");

/** Junta trozos seguidos con la misma marca. Los espacios entre dos cambios quedan dentro del cambio. */
function juntar(partes: Parte[]): Parte[] {
  const salida: Parte[] = [];
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    const espacio = /^\s+$/.test(p.texto);
    const cambio = espacio ? !!(salida.at(-1)?.cambio && partes.slice(i + 1).find((x) => !/^\s+$/.test(x.texto))?.cambio) : p.cambio;
    const ultimo = salida.at(-1);
    if (ultimo && ultimo.cambio === cambio) ultimo.texto += p.texto;
    else salida.push({ texto: p.texto, cambio });
  }
  return salida;
}

/**
 * Las palabras que cambiaron entre la respuesta propuesta y la corregida (la subsecuencia común más larga, palabra
 * por palabra; sin distinguir mayúsculas, tildes ni la puntuación pegada). Si los textos son muy largos, no marca
 * nada: mejor sin resaltado que una página lenta.
 */
export function diferenciaPalabras(antes: string, despues: string): { antes: Parte[]; despues: Parte[] } {
  const a = trozos(antes);
  const b = trozos(despues);
  const pa = a.map((x, i) => [x, i] as const).filter(([x]) => !/^\s+$/.test(x));
  const pb = b.map((x, i) => [x, i] as const).filter(([x]) => !/^\s+$/.test(x));
  if (pa.length * pb.length > MAX_CELDAS) {
    return { antes: [{ texto: antes, cambio: false }], despues: [{ texto: despues, cambio: false }] };
  }
  const ka = pa.map(([x]) => clave(x));
  const kb = pb.map(([x]) => clave(x));
  const n = ka.length;
  const m = kb.length;
  // largo[i][j]: subsecuencia común más larga de ka[i..] y kb[j..].
  const largo = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      largo[i][j] = ka[i] === kb[j] ? largo[i + 1][j + 1] + 1 : Math.max(largo[i + 1][j], largo[i][j + 1]);
    }
  }
  const igualA = new Set<number>();
  const igualB = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      igualA.add(pa[i][1]);
      igualB.add(pb[j][1]);
      i++;
      j++;
    } else if (largo[i + 1][j] >= largo[i][j + 1]) i++;
    else j++;
  }
  const marcar = (ts: string[], iguales: Set<number>) => juntar(ts.map((t, k) => ({ texto: t, cambio: !/^\s+$/.test(t) && !iguales.has(k) })));
  return { antes: marcar(a, igualA), despues: marcar(b, igualB) };
}

// --- La frase de arriba -------------------------------------------------------------------------------

const cosas = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;

/** "Patty sabe 4 cosas que le enseñaste, aprendió de 2 correcciones y tiene 1 pregunta para ti." */
export function fraseEstado(nombre: string, n: { sabe: number; correcciones: number; preguntas: number }): string {
  if (!n.sabe && !n.correcciones && !n.preguntas) {
    return `${nombre} todavía no sabe nada tuyo: contesta con tus casas y tu horario. Enséñale lo que más te preguntan.`;
  }
  const sabe = n.sabe ? `sabe ${cosas(n.sabe, "cosa", "cosas")} que le enseñaste` : "todavía no sabe nada que le hayas enseñado";
  const aprendio = n.correcciones ? `aprendió de ${cosas(n.correcciones, "corrección", "correcciones")}` : "todavía no tiene correcciones";
  const preguntas = n.preguntas ? `tiene ${cosas(n.preguntas, "pregunta", "preguntas")} para ti` : "no tiene preguntas pendientes";
  return `${nombre} ${sabe}, ${aprendio} y ${preguntas}.`;
}

// --- Qué tan lista está -------------------------------------------------------------------------------

export type Renglon = { clave: string; listo: boolean; titulo: string; detalle: string; href: string; accion: string };

export type DatosLista = {
  casas: { precio: number | null; fotos: number }[];
  franjas: number;
  tono: string;
  temasCorredor: number;
  sabe: number;
  preguntas: number;
};

/** Cuántas cosas enseñadas cuentan como "lo básico": las preguntas de siempre (mascotas, pago, parqueo, zonas…). */
export const MINIMO_ENSENADO = 5;

/** La lista de "Qué tan lista está": cada renglón dice si está y dónde se arregla. */
export function listaPreparacion(d: DatosLista): Renglon[] {
  const incompletas = d.casas.filter((c) => !c.precio || c.fotos === 0).length;
  return [
    {
      clave: "casas",
      listo: d.casas.length > 0,
      titulo: "Casas en oferta",
      detalle: d.casas.length ? `${cosas(d.casas.length, "casa", "casas")} para ofrecer` : "Todavía no tiene casas para ofrecer",
      href: "/panel/propiedades",
      accion: d.casas.length ? "Ver mis casas" : "Agregar una casa",
    },
    {
      clave: "fichas",
      listo: d.casas.length > 0 && incompletas === 0,
      titulo: "Casas con precio y fotos",
      detalle: !d.casas.length
        ? "Cuando agregues casas, ponles precio y fotos"
        : incompletas
          ? `${cosas(incompletas, "casa no tiene", "casas no tienen")} precio o fotos`
          : "Todas tienen precio y fotos",
      href: "/panel/propiedades",
      accion: "Completar",
    },
    {
      clave: "horario",
      listo: d.franjas > 0,
      titulo: "Horario de visitas",
      detalle: d.franjas ? `${cosas(d.franjas, "horario", "horarios")} para ofrecer citas` : "Sin horario no puede ofrecer citas",
      href: "/panel/agenda/horario",
      accion: d.franjas ? "Ver horario" : "Poner horario",
    },
    {
      clave: "tono",
      listo: d.tono.trim().length > 0,
      titulo: "Cómo escribe",
      detalle: d.tono.trim() ? `«${d.tono.trim().length > 60 ? `${d.tono.trim().slice(0, 59)}…` : d.tono.trim()}»` : "No le has dicho cómo quieres que escriba",
      href: "/panel/ajustes",
      accion: "Ajustes",
    },
    {
      clave: "temas",
      listo: d.temasCorredor > 0,
      titulo: "Temas que van a ti",
      detalle: d.temasCorredor ? `${cosas(d.temasCorredor, "tema", "temas")} que no contesta y te pasa` : "No sabe qué temas pasarte a ti",
      href: "/panel/ajustes",
      accion: "Ajustes",
    },
    {
      clave: "ensenado",
      listo: d.sabe >= MINIMO_ENSENADO,
      titulo: `Al menos ${MINIMO_ENSENADO} cosas enseñadas`,
      detalle: d.sabe ? `Lleva ${cosas(d.sabe, "cosa", "cosas")}` : "Todavía no le enseñaste nada",
      href: "/panel/cerebro#ensenar",
      accion: "Enseñarle",
    },
    {
      clave: "preguntas",
      listo: d.preguntas === 0,
      titulo: "Preguntas contestadas",
      detalle: d.preguntas ? `${cosas(d.preguntas, "pregunta espera", "preguntas esperan")} tu respuesta` : "No te debe ninguna",
      href: "/panel/cerebro?ver=dudas",
      accion: "Contestar",
    },
  ];
}
