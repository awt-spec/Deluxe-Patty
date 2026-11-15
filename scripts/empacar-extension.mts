// Empaca la extensión de Chrome (extension/) en public/extension/buscador-duenos.zip, con la dirección
// del panel puesta en config.js, en panel.js (el content script de la página de instalación) y en los permisos y
// el content script del manifiesto. Corre antes de `next build`
// (prebuild), así cada despliegue sirve la extensión que habla con él.
//
//   npx tsx scripts/empacar-extension.mts [https://dominio]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

/**
 * Lo único que entra al zip (que es público). Un archivo nuevo de la extensión se agrega aquí a propósito; cualquier
 * otra cosa en extension/ (un borrador, una captura, un .env olvidado) hace fallar el empaque. Los ocultos (.DS_Store)
 * se ignoran.
 */
export const ARCHIVOS_EXTENSION = [
  "background.js",
  "bitacora.js",
  "canal.js",
  "comun.js",
  "config.js",
  "control.js",
  "icono-128.png",
  "icono-16.png",
  "icono-48.png",
  "ilustra-conectar.svg",
  "ilustra-pasos.svg",
  "ilustra-quieta.svg",
  "manifest.json",
  "maquina.js",
  "mensajes.js",
  "panel.js",
  "ritmo.js",
  "sidepanel.css",
  "sidepanel.html",
  "sidepanel.js",
  "vista-panel.js",
] as const;

/** Lo que hay en la carpeta y no está en la lista (sin contar los ocultos), y lo que falta de la lista. */
export function revisarCarpeta(presentes: string[]): { sobran: string[]; faltan: string[] } {
  const lista = new Set<string>(ARCHIVOS_EXTENSION);
  const visibles = presentes.filter((n) => !n.startsWith("."));
  return {
    sobran: visibles.filter((n) => !lista.has(n)).sort(),
    faltan: ARCHIVOS_EXTENSION.filter((n) => !visibles.includes(n)),
  };
}

/** Sin esquema se asume https. Devuelve el origen limpio o null si no es una dirección válida. */
export function normalizar(v: string | undefined): string | null {
  const d = (v ?? "").trim().replace(/\/+$/, "");
  const completa = !d || /^https?:\/\//.test(d) ? d : `https://${d}`;
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(completa) ? completa : null;
}

/**
 * La dirección del panel que lleva la extensión. En producción (VERCEL_ENV=production) tiene que ser https y no hay
 * respaldo: una build mal configurada falla en vez de emitir una extensión que manda el permiso sin cifrar. Fuera de
 * producción, si no hay nada válido, http://localhost:3000.
 */
export function direccionApp(arg: string | undefined, env: Record<string, string | undefined>): string {
  const app = normalizar(arg) ?? normalizar(env.NEXT_PUBLIC_URL_APP) ?? normalizar(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (env.VERCEL_ENV === "production") {
    if (!app || !app.startsWith("https://")) {
      throw new Error("En producción NEXT_PUBLIC_URL_APP tiene que ser una dirección https:// válida para empacar la extensión.");
    }
    return app;
  }
  return app ?? "http://localhost:3000";
}

const CARPETA = "buscador-duenos";
const CON_DIRECCION = new Set(["config.js", "manifest.json", "panel.js"]);

function empacar() {
  const app = direccionApp(process.argv[2], process.env);
  const { sobran, faltan } = revisarCarpeta(readdirSync("extension"));
  if (sobran.length || faltan.length) {
    throw new Error(
      `extension/ no coincide con la lista de scripts/empacar-extension.mts.` +
        (sobran.length ? ` Sobran: ${sobran.join(", ")}.` : "") +
        (faltan.length ? ` Faltan: ${faltan.join(", ")}.` : ""),
    );
  }
  const archivos = [...ARCHIVOS_EXTENSION].sort().map((nombre) => {
    let datos = readFileSync(join("extension", nombre));
    if (CON_DIRECCION.has(nombre)) datos = Buffer.from(datos.toString("utf8").replaceAll("__APP__", app));
    return { nombre: `${CARPETA}/${nombre}`, datos };
  });

  mkdirSync("public/extension", { recursive: true });
  writeFileSync("public/extension/buscador-duenos.zip", zip(archivos));
  // La versión que muestra el panel sale del mismo manifest.json (app/panel/duenos/extension/page.tsx lo importa).
  const { version } = JSON.parse(readFileSync(join("extension", "manifest.json"), "utf8")) as { version: string };
  console.log(`Extensión ${version} empacada para ${app}: public/extension/buscador-duenos.zip (${archivos.length} archivos)`);
}

// Solo al correrlo como script (las pruebas importan las reglas sin empacar).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) empacar();

// ZIP mínimo (deflate, sin carpetas ni extras): lo que Chrome y los sistemas abren sin problema.
function zip(entradas: { nombre: string; datos: Buffer }[]): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const { nombre, datos } of entradas) {
    const nombreB = Buffer.from(nombre, "utf8");
    const comprimido = deflateRawSync(datos);
    const crc = crc32(datos);
    const comun = (b: Buffer, o: number) => {
      b.writeUInt16LE(20, o); // versión necesaria
      b.writeUInt16LE(0x0800, o + 2); // nombres en UTF-8
      b.writeUInt16LE(8, o + 4); // deflate
      b.writeUInt32LE(0x00210000, o + 6); // fecha fija: 1980-01-01 00:00
      b.writeUInt32LE(crc, o + 10);
      b.writeUInt32LE(comprimido.length, o + 14);
      b.writeUInt32LE(datos.length, o + 18);
      b.writeUInt16LE(nombreB.length, o + 22);
    };
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    comun(local, 4);
    locales.push(local, nombreB, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // hecho por
    comun(central, 6);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombreB);
    desplazamiento += local.length + nombreB.length + comprimido.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

function crc32(datos: Buffer): number {
  let c = ~0;
  for (const byte of datos) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
