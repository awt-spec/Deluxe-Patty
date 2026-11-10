import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";

// Word, Excel y texto que el corredor sube al chat de Patty: se convierten a texto en el servidor y Claude los lee
// como datos (nunca como instrucciones). El archivo no se guarda: se lee y se descarta.

export const LIMITE_DOCUMENTO = 3_500_000; // bytes
export const MAX_CARACTERES = 60_000;
const MAX_HOJAS = 3;
const MAX_FILAS = 300;
const MAX_COLUMNAS = 30;

export type RazonDocumento = "formato" | "muy_grande" | "vacio" | "ilegible";

export class ErrorDocumento extends Error {
  constructor(public readonly razon: RazonDocumento) {
    super(`Documento no legible: ${razon}`);
    this.name = "ErrorDocumento";
  }
}

export const EXTENSIONES_TEXTO = ["txt", "csv", "tsv", "md"];
export const EXTENSIONES_DOCUMENTO = ["docx", "xlsx", ...EXTENSIONES_TEXTO];

export const extensionDe = (nombre: string) => (nombre.toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] ?? "");

const limpiar = (t: string) =>
  t
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function celda(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, " ").trim();
}

/** Texto de un archivo de oficina o de texto plano. Los formatos viejos (.doc, .xls) piden guardarse como .docx / .xlsx. */
export async function textoDeDocumento(datos: Buffer, nombre: string): Promise<string> {
  if (datos.length > LIMITE_DOCUMENTO) throw new ErrorDocumento("muy_grande");
  const ext = extensionDe(nombre);
  let texto: string;
  try {
    if (EXTENSIONES_TEXTO.includes(ext)) {
      texto = new TextDecoder("utf-8").decode(datos);
    } else if (ext === "docx") {
      texto = (await mammoth.extractRawText({ buffer: datos })).value;
    } else if (ext === "xlsx") {
      const hojas = await readXlsxFile(datos);
      texto = hojas
        .slice(0, MAX_HOJAS)
        .map((h) => {
          const filas = h.data.slice(0, MAX_FILAS).map((fila) => fila.slice(0, MAX_COLUMNAS).map(celda).join(" | "));
          const recorte = h.data.length > MAX_FILAS ? `\n(…${h.data.length - MAX_FILAS} filas más)` : "";
          return `## Hoja: ${h.sheet}\n${filas.join("\n")}${recorte}`;
        })
        .join("\n\n");
    } else {
      throw new ErrorDocumento("formato");
    }
  } catch (e) {
    if (e instanceof ErrorDocumento) throw e;
    throw new ErrorDocumento("ilegible");
  }
  texto = limpiar(texto);
  if (!texto) throw new ErrorDocumento("vacio");
  return texto.length > MAX_CARACTERES ? `${texto.slice(0, MAX_CARACTERES)}\n(…el archivo sigue; se leyeron los primeros ${MAX_CARACTERES} caracteres)` : texto;
}

export function mensajeDeDocumento(razon: RazonDocumento): string {
  switch (razon) {
    case "formato":
      return "Solo leo Word (.docx), Excel (.xlsx) y texto (.txt, .csv). Si es un archivo viejo (.doc o .xls), guárdalo como .docx o .xlsx.";
    case "muy_grande":
      return "El archivo pesa más de 3,5 MB. Manda uno más liviano o solo las hojas que importan.";
    case "vacio":
      return "El archivo no tiene texto que leer.";
    default:
      return "No pude leer ese archivo. Revisa que no esté dañado o protegido con contraseña.";
  }
}
