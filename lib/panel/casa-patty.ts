// Cargar una casa desde el chat de Patty. Lo entiende el código, sin pasar por el modelo: el mensaje empieza
// con un verbo de agregar ("agrega", "carga", "guarda", "sube", "registra"…) y lo que se agrega es una
// propiedad ("esta casa", "un apartamento", "el lote"…). "¿Cómo agrego una casa?" es una pregunta y sigue
// yendo al modelo; "agrega una visita" o "agrega un cliente" no son casas. La ficha la arma la misma
// conversación de "Agregar casa" (lib/propiedades/conversar.ts) y solo se guarda cuando el corredor confirma.
// Este archivo no importa nada: lo usa el chat en el navegador.

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Saludo o nombre al principio ("Patty, …", "hola, …"), "por favor" y formas de pedir ("quiero", "me ayudas a").
const ANTES = String.raw`^\s*(?:(?:hola|oye|mira|patty|bueno|ok|listo)[\s,.:!]+)*(?:por\s+favor[\s,]+)?(?:¿\s*)?(?:(?:quiero|necesito|ocupo|vamos\s+a|ayudame\s+a|me\s+ayudas\s+a|me\s+puedes|me\s+podes|me\s+podrias|puedes|podes|podrias|te\s+pido\s+que)\s+)?`;
// Verbo de agregar, en imperativo, infinitivo o con pronombre pegado ("agrégala", "súbeme").
const VERBO = String.raw`(?:agreg|anad|carg|guard|registr|ingres)[a-z]*|sub(?:e|i|a|ir|eme|ime|ela|ila|ele|ile|emela|imela|amela)?`;
// Lo que se agrega: una sola propiedad, dicha con su artículo ("esta casa", "un apartamento nuevo", "la finca").
const DETERMINANTE = String.raw`(?:(?:una|un|esta|este|esa|ese|la|el|mi|nueva|nuevo|otra|otro)\s+){0,2}`;
const PROPIEDAD = String.raw`(?:casa|casita|propiedad|apartamento|apto|apartamentito|depa|departamento|lote|terreno|finca|quinta|local|oficina|bodega|penthouse|condominio)\b`;

const PEDIDO = new RegExp(`${ANTES}(?:${VERBO})[\\s:,]+(?:a\\s+mis\\s+(?:casas|propiedades)\\b|${DETERMINANTE}${PROPIEDAD})`);

/** true si el corredor le pide a Patty cargar una casa (contándola en el mismo mensaje o no). */
export function pideCargarCasa(texto: string): boolean {
  const t = sinTildes(texto).trim();
  const m = PEDIDO.exec(t);
  if (!m) return false;
  // "¿Puedes agregar una casa?" sin nada más es una pregunta sobre lo que se puede hacer, no un pedido.
  const resto = t.slice(m[0].length).replace(/[\s?¿!.,:]+/g, "");
  if (t.startsWith("¿") && !resto) return false;
  return true;
}
