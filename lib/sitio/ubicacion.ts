import { ZONAS, normalizarZona, sinTildes, zonaPorNombre, zonasEnTexto, type Mencion, type Zona } from "../agenda/zonas";

// ¿En qué zona queda una casa? El sitio web trae cantón, distrito, una "ubicación" libre y el título; aquí se
// elige la zona más precisa que la agenda conoce y se dice si hay que preguntarle al corredor.
//
// Reglas (función pura, sin base):
//  1. El distrito (o el barrio entre paréntesis, "San Antonio (Bello Horizonte)") gana sobre el cantón si es del
//     mismo cantón. Un distrito que se llama igual que el cantón ("Escazú, Escazú") dice poco: no cuenta.
//  2. Un barrio del título o la ubicación que queda DENTRO de ese distrito gana: es más preciso y no es una
//     contradicción. Así es en Costa Rica:
//       Lindora, Valle del Sol, Bosques de Lindora ⊂ Pozos (Santa Ana)    Guachipelín, Distrito 4 ⊂ San Rafael (Escazú)
//       Jaboncillos ⊂ San Antonio de Escazú                                Bello Horizonte ⊂ San Antonio / Escazú
//       Rohrmoser ⊂ Pavas (San José)                                       Playas del Coco ⊂ Sardinal (Carrillo)
//       Hacienda Los Reyes ⊂ La Guácima (Alajuela)                         Playa Negra ⊂ Santa Cruz
//     Un cantón en el título ("SANTA ANA LINDORA") nunca contradice: el barrio o el distrito es más preciso.
//  3. Contradicción de verdad (se pregunta, con ambas como opciones): un barrio y un distrito distintos del mismo
//     cantón que no se contienen (Lindora y "Santa Ana Centro"; Lindora y Piedades; Guachipelín y San Antonio), dos
//     barrios distintos en el título, o un barrio de otro cantón (el título dice Lindora y el cantón es Escazú).
//  4. Un nombre que existe en dos lugares ("Playa Hermosa": Garabito y Guanacaste) se pregunta.
//  5. Zona genérica ("San José", "Costa Rica", "GAM", una provincia): si el texto nombra un barrio conocido, el
//     barrio; si no, se pregunta. Un cantón que la agenda no conoce también se pregunta.

export type EntradaUbicacion = {
  canton?: string | null;
  distrito?: string | null;
  ubicacion?: string | null;
  titulo?: string | null;
  descripcion?: string | null;
  provincia?: string | null;
};

export type ZonaResuelta = {
  zona: string | null;
  /** true: el código está seguro; false: se guarda la mejor conjetura y se le pregunta al corredor. */
  segura: boolean;
  motivo?: string;
  /** Las zonas entre las que hay que elegir (la conjetura primero). */
  opciones?: string[];
};

const PROVINCIAS = new Set(["san jose", "alajuela", "cartago", "heredia", "guanacaste", "puntarenas", "limon"]);
const GENERICAS = new Set(["costa rica", "gam", "gran area metropolitana", "valle central", "guanacaste", "puntarenas", "limon"]);
const NIVEL = { barrio: 0, distrito: 1, canton: 2 } as const;

const limpio = (t: string | null | undefined) => (typeof t === "string" && t.trim() ? t.trim() : null);

/** El cantón con el nombre de la lista ("Escazu" → "Escazú"); si es una zona de otro nivel, su cantón. */
function cantonDe(canton: string | null): { clave: string | null; zona: Zona | null } {
  if (!canton) return { clave: null, zona: null };
  const k = sinTildes(canton);
  const comoCanton = ZONAS.find((zz) => sinTildes(zz.canton) === k);
  const exacta = zonaPorNombre(canton);
  if (exacta && exacta.nivel !== "canton") return { clave: sinTildes(exacta.canton), zona: exacta };
  // La zona del cantón: la que se llama igual o, si no (Flores, Garabito, Mora…), su cabecera.
  const cabecera = exacta ?? ZONAS.find((zz) => sinTildes(zz.canton) === k && zz.nivel === "canton") ?? null;
  return { clave: comoCanton ? k : exacta ? sinTildes(exacta.canton) : k, zona: cabecera };
}

/** "San Antonio (Bello Horizonte)" en Escazú → Bello Horizonte; "San Rafael" en Escazú → San Rafael de Escazú. */
function distritoDe(distrito: string | null, canton: string | null): { zona: Zona | null; nombre: string | null; debil: boolean } {
  if (!distrito) return { zona: null, nombre: null, debil: true };
  const parentesis = distrito.match(/\(([^)]+)\)/)?.[1]?.trim() ?? null;
  const base = distrito.replace(/\([^)]*\)/g, "").replace(/\bcentro\b/i, "").replace(/\s+/g, " ").trim();
  const centro = /\bcentro\b/i.test(distrito);
  const debil = !!canton && !centro && !parentesis && sinTildes(base) === sinTildes(canton);
  const candidatos = [parentesis, base, canton ? `${base} de ${canton}` : null].filter((c): c is string => !!c);
  for (const c of candidatos) {
    const zona = zonaPorNombre(c);
    if (zona && (!canton || sinTildes(zona.canton) === sinTildes(cantonDe(canton).zona?.canton ?? canton))) return { zona, nombre: sinTildes(base), debil };
  }
  return { zona: null, nombre: sinTildes(base), debil };
}

/** ¿La zona `a` queda dentro de `b`? (un barrio dentro de su distrito, o cualquiera dentro de su cantón). */
function dentroDe(a: Zona, b: Zona): boolean {
  if (a === b) return true;
  if (sinTildes(a.canton) !== sinTildes(b.canton)) return false;
  if (b.nivel === "canton") return true;
  if (b.nivel === "distrito") return a.nivel === "barrio" && a.distritos.some((d) => b.distritos.some((e) => sinTildes(d) === sinTildes(e)));
  return false;
}

/** ¿La zona `a` queda en el distrito que trae el sitio? (aunque ese distrito sea la cabecera: "Santa Ana Centro"). */
function enElDistrito(a: Zona, d: Zona): boolean {
  if (a === d) return true;
  if (sinTildes(a.canton) !== sinTildes(d.canton) || NIVEL[a.nivel] > NIVEL[d.nivel]) return false;
  return a.distritos.some((x) => d.distritos.some((y) => sinTildes(x) === sinTildes(y)));
}

const dudosa = (zona: string | null, motivo: string, opciones: string[]): ZonaResuelta => ({
  zona,
  segura: false,
  motivo,
  opciones: [...new Set(opciones.filter(Boolean))],
});

/** La zona más precisa de una casa y si hay que preguntarle al corredor. */
export function resolverZona(e: EntradaUbicacion): ZonaResuelta {
  const cantonTexto = limpio(e.canton);
  const ubicacion = limpio(e.ubicacion);
  const C = cantonDe(cantonTexto);
  const D = distritoDe(limpio(e.distrito), cantonTexto);
  const distrito = D.zona && !D.debil ? D.zona : null;

  // Lo que nombran el título y la ubicación, sin las provincias ("VENDO HEREDIA BELÉN": Heredia es la provincia).
  const menciones = zonasEnTexto(`${e.titulo ?? ""} | ${ubicacion ?? ""}`).filter(
    (m) => !(PROVINCIAS.has(m.texto) && C.clave && sinTildes(m.zona.canton) !== C.clave),
  );
  const delCanton = (m: Mencion) => !C.clave || sinTildes(m.zona.canton) === C.clave;
  const propias = menciones.filter(delCanton);
  const ajenas = menciones.filter((m) => !delCanton(m) && m.zona.nivel !== "canton");

  // La mención más precisa; otra igual de precisa que no la contiene es una contradicción.
  const ordenadas = [...propias].sort((a, b) => NIVEL[a.zona.nivel] - NIVEL[b.zona.nivel]);
  const mejor = ordenadas[0] ?? null;
  const choca = mejor ? ordenadas.find((m) => m.zona !== mejor.zona && !dentroDe(mejor.zona, m.zona) && !dentroDe(m.zona, mejor.zona)) : undefined;

  let r: ZonaResuelta;
  if (mejor && distrito) {
    if (enElDistrito(mejor.zona, distrito)) r = { zona: mejor.zona.nombre, segura: true };
    else if (dentroDe(distrito, mejor.zona)) r = { zona: distrito.nombre, segura: true };
    else r = dudosa(mejor.zona.nombre, `El título o la ubicación dicen ${mejor.zona.nombre} y el distrito dice ${limpio(e.distrito)}.`, [mejor.zona.nombre, distrito.nombre]);
  } else if (mejor) {
    const masPreciso = C.zona && NIVEL[C.zona.nivel] < NIVEL[mejor.zona.nivel] && dentroDe(C.zona, mejor.zona) ? C.zona : mejor.zona;
    r = { zona: masPreciso.nombre, segura: true };
  } else if (distrito) {
    r = { zona: distrito.nombre, segura: true };
  } else if (C.zona) {
    r = { zona: C.zona.nombre, segura: true };
  } else {
    const escrito = cantonTexto ?? ubicacion ?? limpio(e.distrito);
    r = escrito
      ? dudosa(normalizarZona(escrito), `No conozco la zona «${escrito}»: no sé cuánto se tarda en llegar.`, [])
      : dudosa(null, "El sitio no dice dónde queda.", []);
  }

  if (r.segura && choca) r = dudosa(r.zona, `El título nombra ${mejor!.zona.nombre} y ${choca.zona.nombre}.`, [r.zona!, choca.zona.nombre]);
  if (r.segura && ajenas.length) {
    const otra = ajenas[0].zona.nombre;
    r = dudosa(r.zona, `El título dice ${otra}, pero el cantón es ${cantonTexto}.`, [r.zona!, otra]);
  }
  const ambigua = menciones.find((m) => m.ambigua && m.zona.nombre === r.zona);
  if (r.segura && ambigua) {
    r = dudosa(r.zona, `Hay más de una ${ambigua.texto.replace(/\b\w/g, (l) => l.toUpperCase())}.`, ambigua.ambigua!.slice().sort((a) => (a === r.zona ? -1 : 1)));
  }

  // Genérica: San José (la ciudad, sin barrio), "Costa Rica", una provincia. Un barrio en la descripción sirve.
  const generica = r.zona === null || GENERICAS.has(sinTildes(r.zona)) || (r.zona === "San José" && !distrito && !(mejor && mejor.zona.nivel !== "canton"));
  if (generica) {
    const enDescripcion = zonasEnTexto(e.descripcion).filter((m) => m.zona.nivel !== "canton" && delCanton(m) && !m.ambigua);
    const unicas = [...new Set(enDescripcion.map((m) => m.zona.nombre))];
    if (unicas.length === 1) return { zona: unicas[0], segura: true };
    return dudosa(r.zona, r.motivo ?? `«${r.zona}» es muy general: ¿en qué barrio queda?`, [...(r.opciones ?? []), ...unicas]);
  }
  return r;
}

/** Para casas hechas en el portal: solo se normaliza lo escrito; si no hay zona, la más precisa de los datos. */
export function zonaParaGuardar(d: { zona?: string | null; canton?: string | null; distrito?: string | null; titulo?: string | null }): string | null {
  const zona = limpio(d.zona);
  if (zona) return normalizarZona(zona).slice(0, 80);
  if (!limpio(d.canton) && !limpio(d.distrito)) return null;
  return resolverZona({ canton: d.canton, distrito: d.distrito, titulo: d.titulo }).zona?.slice(0, 80) ?? null;
}

// --- La pregunta al corredor ----------------------------------------------------------------------------
// Se guarda en `conocimiento` (lo que la asistente sabe y las dudas): pendiente mientras el corredor no
// contesta; activa con la zona cuando contesta (la asistente la conoce y la importación la respeta); archivada si
// la quita (se queda la conjetura y no se vuelve a preguntar).

export const PREFIJO_UBICACION = "Ubicación ";

export function temaUbicacion(codigo: string, titulo: string, sitio: string, opciones: string[]): string {
  const corto = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const tema = `${PREFIJO_UBICACION}${codigo}: ¿dónde queda «${corto(titulo, 90)}»? El sitio dice «${corto(sitio, 90)}».${
    opciones.length ? ` Opciones: ${opciones.join(" | ")}` : ""
  }`;
  return tema.slice(0, 300);
}

export type PreguntaUbicacion = { codigo: string; titulo: string; sitio: string; opciones: string[] };

/** Lee la pregunta guardada (null si el tema no es de ubicación). */
export function leerTemaUbicacion(tema: string): PreguntaUbicacion | null {
  const m = tema.match(/^Ubicación ([A-Za-z0-9-]+): ¿dónde queda «(.*)»\? El sitio dice «(.*)»\.(?: Opciones: (.*))?$/s);
  if (!m) return null;
  return { codigo: m[1].toUpperCase(), titulo: m[2], sitio: m[3], opciones: m[4] ? m[4].split(" | ").map((o) => o.trim()).filter(Boolean) : [] };
}

/** La zona que contestó el corredor ("Queda en Lindora" → Lindora); si no nombra una conocida, lo escrito. */
export function zonaDeRespuesta(respuesta: string | null | undefined): string | null {
  const r = limpio(respuesta);
  if (!r) return null;
  const exacta = zonaPorNombre(r);
  if (exacta) return exacta.nombre;
  const menciones = zonasEnTexto(r).sort((a, b) => NIVEL[a.zona.nivel] - NIVEL[b.zona.nivel]);
  return menciones[0]?.zona.nombre ?? normalizarZona(r).slice(0, 80);
}

/** Lo que dice el sitio de la ubicación, para mostrarlo en la pregunta. */
export function loQueDiceElSitio(e: EntradaUbicacion): string {
  const partes = [limpio(e.ubicacion), limpio(e.distrito), limpio(e.canton)].filter((p): p is string => !!p);
  const vistas = new Set<string>();
  return partes.filter((p) => {
    const k = sinTildes(p);
    if ([...vistas].some((v) => v.includes(k))) return false;
    vistas.add(k);
    return true;
  }).join(", ") || "nada";
}
