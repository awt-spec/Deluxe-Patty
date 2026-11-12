// Lector de lo que escribe Patty (un markdown chico): títulos, párrafos, listas, tablas, citas y bloques de
// código (```mermaid es un diagrama). Lo usan el chat (para mostrarlo ordenado) y el PDF (para armarlo con
// la marca). Nunca interpreta HTML: todo queda como texto.

export type Bloque =
  | { tipo: "titulo"; nivel: 1 | 2 | 3; texto: string }
  | { tipo: "parrafo"; texto: string }
  | { tipo: "lista"; ordenada: boolean; items: string[] }
  | { tipo: "tabla"; cabecera: string[]; filas: string[][] }
  | { tipo: "cita"; texto: string }
  | { tipo: "codigo"; lenguaje: string; texto: string };

const celdas = (linea: string) =>
  linea
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const esSeparadorTabla = (linea: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea);

export function bloques(texto: string): Bloque[] {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n");
  const salida: Bloque[] = [];
  let parrafo: string[] = [];
  const cerrarParrafo = () => {
    if (parrafo.length) salida.push({ tipo: "parrafo", texto: parrafo.join("\n").trim() });
    parrafo = [];
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const recortada = linea.trim();

    // Bloque de código (```mermaid, ```texto…): hasta el cierre o el final.
    const valla = /^```\s*([\w-]*)\s*$/.exec(recortada);
    if (valla) {
      cerrarParrafo();
      const cuerpo: string[] = [];
      i++;
      while (i < lineas.length && !/^```\s*$/.test(lineas[i].trim())) cuerpo.push(lineas[i++]);
      salida.push({ tipo: "codigo", lenguaje: valla[1].toLowerCase(), texto: cuerpo.join("\n") });
      continue;
    }

    if (!recortada) {
      cerrarParrafo();
      continue;
    }
    // Separadores (---): no se muestran.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(recortada)) {
      cerrarParrafo();
      continue;
    }

    const titulo = /^(#{1,6})\s+(.+?)\s*#*$/.exec(recortada);
    if (titulo) {
      cerrarParrafo();
      salida.push({ tipo: "titulo", nivel: Math.min(3, titulo[1].length) as 1 | 2 | 3, texto: titulo[2] });
      continue;
    }

    // Tabla: una fila con | seguida de la línea de guiones.
    if (recortada.includes("|") && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
      cerrarParrafo();
      const cabecera = celdas(recortada);
      const filas: string[][] = [];
      i += 2;
      while (i < lineas.length && lineas[i].includes("|") && lineas[i].trim()) filas.push(celdas(lineas[i++]));
      i--;
      salida.push({ tipo: "tabla", cabecera, filas: filas.map((f) => cabecera.map((_, j) => f[j] ?? "")) });
      continue;
    }

    const vineta = /^\s*[-*•]\s+(.*)$/.exec(linea);
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(linea);
    if (vineta || numero) {
      cerrarParrafo();
      const ordenada = !!numero;
      const items: string[] = [];
      while (i < lineas.length) {
        const m = ordenada ? /^\s*\d+[.)]\s+(.*)$/.exec(lineas[i]) : /^\s*[-*•]\s+(.*)$/.exec(lineas[i]);
        if (m) items.push(m[1].trim());
        // Una línea que sigue sin viñeta y con sangría continúa el punto anterior.
        else if (items.length && /^\s{2,}\S/.test(lineas[i])) items[items.length - 1] += ` ${lineas[i].trim()}`;
        else break;
        i++;
      }
      i--;
      salida.push({ tipo: "lista", ordenada, items });
      continue;
    }

    const cita = /^>\s?(.*)$/.exec(recortada);
    if (cita) {
      cerrarParrafo();
      const partes = [cita[1]];
      while (i + 1 < lineas.length && /^>\s?/.test(lineas[i + 1].trim())) partes.push(lineas[++i].trim().replace(/^>\s?/, ""));
      salida.push({ tipo: "cita", texto: partes.join("\n") });
      continue;
    }

    parrafo.push(linea);
  }
  cerrarParrafo();
  return salida;
}

/** Trozos de una línea: texto, **negrita**, *cursiva*, `código`, [enlace](ruta) e ![imagen](url). */
export type Trozo =
  | { tipo: "texto"; texto: string }
  | { tipo: "negrita"; texto: string }
  | { tipo: "cursiva"; texto: string }
  | { tipo: "codigo"; texto: string }
  | { tipo: "enlace"; texto: string; url: string }
  | { tipo: "imagen"; alt: string; url: string };

const INLINE = /(!\[[^\]\n]*\]\([^)\s]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\([^)\s]+\))/g;

export function trozos(texto: string): Trozo[] {
  return texto
    .split(INLINE)
    .filter((p) => p !== "")
    .map((p): Trozo => {
      const imagen = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(p);
      if (imagen) return { tipo: "imagen", alt: imagen[1], url: imagen[2] };
      if (/^\*\*[^*]+\*\*$/.test(p)) return { tipo: "negrita", texto: p.slice(2, -2) };
      if (/^`[^`]+`$/.test(p)) return { tipo: "codigo", texto: p.slice(1, -1) };
      if (/^\*[^*]+\*$/.test(p)) return { tipo: "cursiva", texto: p.slice(1, -1) };
      const enlace = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
      if (enlace) return { tipo: "enlace", texto: enlace[1], url: enlace[2] };
      return { tipo: "texto", texto: p };
    });
}

/** Rutas a las que un enlace de Patty puede llevar: solo pantallas del panel. */
export const esRutaDelPanel = (url: string) => /^\/panel(\/[\w\-/?=&.]*)?$/.test(url);

/** Pedido de PDF: Patty termina con <<pdf Título>> cuando el corredor pidió un documento. */
const PDF = /^<<\s*pdf\s+([^>]{1,120}?)\s*>>\s*$/gim;

export function separarPdf(texto: string): { texto: string; pdf: string | null } {
  let titulo: string | null = null;
  const limpio = texto.replace(PDF, (_, t: string) => {
    titulo ??= t.trim();
    return "";
  });
  return { texto: limpio.replace(/\n{3,}/g, "\n\n").trim(), pdf: titulo };
}
