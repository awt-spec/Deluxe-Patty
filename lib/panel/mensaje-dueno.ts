// "Crear mensaje con Patty" en Dueños directos: Patty le prepara al corredor tres primeros mensajes para un dueño
// (WhatsApp, el formulario de contacto de Encuentra24 y uno para escribirle otra vez). Los manda el corredor, a
// mano: la asistente nunca escribe en frío. Aquí, sin base ni red: los datos que se le pasan a la IA (solo título,
// zona y precio del anuncio, y el nombre y la empresa del corredor), la versión armada por código (demo o respaldo)
// y la revisión de lo que devuelve la IA (ninguna cifra que no esté en esos datos).

export const CANALES_MENSAJE = [
  { clave: "whatsapp", titulo: "Por WhatsApp", ayuda: "Corto y cercano, para el primer saludo." },
  { clave: "formulario", titulo: "Formulario de Encuentra24", ayuda: "Para el botón «Contactar» del anuncio." },
  { clave: "seguimiento", titulo: "Para escribirle otra vez", ayuda: "Si en unos días no contesta." },
] as const;

export type CanalMensaje = (typeof CANALES_MENSAJE)[number]["clave"];
export interface MensajeDueno {
  canal: CanalMensaje;
  texto: string;
}

/** Largo máximo de cada mensaje (lo que devuelve la IA se recorta; lo que edita el corredor también). */
export const MAX_MENSAJE_DUENO = 700;
export const PEDIDOS_MENSAJE_POR_MINUTO = 6;

/** Lo único que se le cuenta a la IA. El texto del anuncio no va: lo escribió un tercero. */
export interface DatosMensajeDueno {
  titulo: string | null;
  zona: string | null;
  /** Ya con formato ("$350.000"), o null. */
  precio: string | null;
  /** Quien escribe ("Patricia"). */
  corredor: string;
  /** Su empresa o marca ("Deluxe Properties"), si es distinta. */
  empresa: string | null;
  /** Primer nombre del anunciante, si parece de persona. */
  nombreDueno: string | null;
}

const limpio = (t: string | null | undefined, max: number) => (t ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || null;

/** Arma los datos desde el lead y el corredor (recortados, sin etiquetas ni saltos raros). */
export function datosParaMensaje(
  lead: { titulo: string | null; zona: string | null; precio: string | null; nombre_anunciante: string | null },
  corredor: { nombre: string; nombre_contacto: string | null },
): DatosMensajeDueno {
  const primer = (lead.nombre_anunciante ?? "").trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") ?? "";
  // Un nombre de empresa ("Inversiones", "Bienes") no se usa para saludar.
  const nombreDueno = primer.length > 1 && primer.length <= 20 && !/^(inversiones|bienes|grupo|inmobiliaria|propiedades|realty)$/i.test(primer) ? primer : null;
  const quien = limpio(corredor.nombre_contacto, 60) ?? limpio(corredor.nombre, 60) ?? "su corredora";
  const empresa = limpio(corredor.nombre, 80);
  return {
    titulo: limpio(lead.titulo, 120),
    // "San José provincia, Escazú, San Rafael" → "Escazú, San Rafael".
    zona: limpio(lead.zona?.split(",").map((x) => x.trim()).filter((x) => x && !/provincia/i.test(x)).slice(-2).join(", ") ?? null, 80),
    precio: limpio(lead.precio, 30),
    corredor: quien,
    empresa: empresa && empresa !== quien ? empresa : null,
    nombreDueno,
  };
}

/** Los mensajes armados por código: los de la demo y el respaldo de uno que la IA trajo mal. Sin cifras ni promesas. */
export function mensajesDeCodigo(d: DatosMensajeDueno): MensajeDueno[] {
  const saludo = d.nombreDueno ? `Hola, ${d.nombreDueno}, buenas.` : "Hola, buenas.";
  const yo = d.empresa ? `Soy ${d.corredor}, de ${d.empresa}.` : `Soy ${d.corredor}, corredora de bienes raíces.`;
  const casa = d.titulo ? `su anuncio «${d.titulo}»` : "su anuncio";
  const donde = d.zona ? ` en ${d.zona}` : "";
  return [
    {
      canal: "whatsapp",
      texto: `${saludo} ${yo} Vi ${casa}${donde} en Encuentra24 y me gustó mucho. ¿Me permite contarle cómo le podría ayudar a venderla? Si prefiere venderla usted, con gusto no le vuelvo a escribir.`,
    },
    {
      canal: "formulario",
      texto: `${saludo} ${yo} Vi ${casa}${donde} y trabajo con compradores que buscan en la zona. Si le parece, le cuento cómo trabajo, sin ningún compromiso. Quedo atenta. ¡Gracias!`,
    },
    {
      canal: "seguimiento",
      texto: `${saludo} Le escribí hace unos días por ${casa}. ¿Sigue disponible? Si le interesa que le ayude a venderla, aquí estoy. Si no, no se preocupe y muchos éxitos con la venta.`,
    },
  ];
}

/** Números de un texto (sin puntos ni comas): "350.000" → "350000". */
const numerosDe = (t: string) => [...t.matchAll(/\d[\d.,]*/g)].map((m) => m[0].replace(/[.,]+$/, "").replace(/[.,]/g, "")).filter(Boolean);

/** ¿El texto trae alguna cifra que no esté en el título, la zona, el precio o los nombres? */
export function traeCifraInventada(texto: string, d: DatosMensajeDueno): boolean {
  const permitidas = new Set(numerosDe([d.titulo, d.zona, d.precio, d.corredor, d.empresa].filter(Boolean).join(" ")));
  return numerosDe(texto).some((n) => !permitidas.has(n));
}

/**
 * Revisa lo que devolvió la IA: un mensaje por canal, recortado; el que falta, viene vacío o trae una cifra que no está
 * en los datos (precio de mercado, plazos, comisiones…) se cambia por el armado por código. `cambiados` dice cuántos.
 */
export function revisarMensajes(crudos: Partial<Record<CanalMensaje, unknown>>, d: DatosMensajeDueno): { mensajes: MensajeDueno[]; cambiados: number } {
  const respaldo = mensajesDeCodigo(d);
  let cambiados = 0;
  const mensajes = CANALES_MENSAJE.map(({ clave }, i): MensajeDueno => {
    const v = crudos[clave];
    const texto = typeof v === "string" ? v.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_MENSAJE_DUENO) : "";
    if (texto.length < 20 || traeCifraInventada(texto, d)) {
      cambiados++;
      return respaldo[i];
    }
    return { canal: clave, texto };
  });
  return { mensajes, cambiados };
}
