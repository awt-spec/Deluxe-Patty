// Empaca la extensión de Chrome (extension/) en public/extension/buscador-duenos.zip, con la dirección
// del panel puesta en config.js y en los permisos del manifiesto. Corre antes de `next build`
// (prebuild), así cada despliegue sirve la extensión que habla con él.
//
//   npx tsx scripts/empacar-extension.mts [https://dominio]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

// Sin esquema se asume https; una dirección rara no tumba el despliegue: se usa la de producción.
const normalizar = (v: string | undefined) => {
  const d = (v ?? "").trim().replace(/\/+$/, "");
  const completa = !d || /^https?:\/\//.test(d) ? d : `https://${d}`;
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(completa) ? completa : null;
};
const app =
  normalizar(process.argv[2]) ??
  normalizar(process.env.NEXT_PUBLIC_URL_APP) ??
  normalizar(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  "http://localhost:3000";

const CARPETA = "buscador-duenos";
const archivos = readdirSync("extension").sort().map((nombre) => {
  let datos = readFileSync(join("extension", nombre));
  if (nombre === "config.js" || nombre === "manifest.json") datos = Buffer.from(datos.toString("utf8").replaceAll("__APP__", app));
  return { nombre: `${CARPETA}/${nombre}`, datos };
});

mkdirSync("public/extension", { recursive: true });
writeFileSync("public/extension/buscador-duenos.zip", zip(archivos));
console.log(`Extensión empacada para ${app}: public/extension/buscador-duenos.zip (${archivos.length} archivos)`);

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
