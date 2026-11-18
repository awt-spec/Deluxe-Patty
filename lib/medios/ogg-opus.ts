// Nota de voz grabada en el navegador → Ogg/Opus, el formato que WhatsApp muestra como nota de voz (con su botón de
// play). Chrome y Safari graban Opus dentro de WebM; aquí se sacan los paquetes Opus del WebM y se ponen en páginas
// Ogg, sin volver a codificar (no se pierde calidad y no hace falta nada pesado). Pura: corre en el navegador y en
// las pruebas.

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Cluster: 0x1f43b675,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  BlockGroup: 0xa0,
  SimpleBlock: 0xa3,
  Block: 0xa1,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Channels: 0x9f,
  Audio: 0xe1,
} as const;

/** Elementos con hijos: se entra en ellos (aunque traigan tamaño desconocido, como en una grabación en vivo). */
const CONTENEDORES = new Set<number>([ID.Segment, ID.Cluster, ID.Tracks, ID.TrackEntry, ID.BlockGroup, ID.Audio]);

export class ErrorOgg extends Error {}

function leerVint(b: Uint8Array, p: number, quitarMarca: boolean): { valor: number; largo: number; desconocido: boolean } {
  const primero = b[p];
  if (primero === undefined || primero === 0) throw new ErrorOgg("vint");
  let largo = 1;
  while (largo <= 8 && !(primero & (0x80 >> (largo - 1)))) largo++;
  if (largo > 8 || p + largo > b.length) throw new ErrorOgg("vint");
  let valor = quitarMarca ? primero & (0xff >> largo) : primero;
  let todoUnos = valor === 0xff >> largo;
  for (let i = 1; i < largo; i++) {
    valor = valor * 256 + b[p + i];
    if (b[p + i] !== 0xff) todoUnos = false;
  }
  return { valor, largo, desconocido: quitarMarca && todoUnos };
}

/** Paquetes Opus y cabecera (OpusHead) de un WebM grabado por MediaRecorder. */
export function leerWebmOpus(datos: Uint8Array): { cabecera: Uint8Array | null; canales: number; paquetes: Uint8Array[] } {
  let p = 0;
  let cabecera: Uint8Array | null = null;
  let canales = 1;
  let esOpus = false;
  const paquetes: Uint8Array[] = [];
  while (p < datos.length) {
    let id: ReturnType<typeof leerVint>;
    let tam: ReturnType<typeof leerVint>;
    try {
      id = leerVint(datos, p, false);
      tam = leerVint(datos, p + id.largo, true);
    } catch {
      break; // Final cortado: se usa lo leído.
    }
    const inicio = p + id.largo + tam.largo;
    if (CONTENEDORES.has(id.valor)) {
      p = inicio;
      continue;
    }
    if (tam.desconocido) throw new ErrorOgg("tamaño desconocido");
    const fin = inicio + tam.valor;
    if (fin > datos.length) break;
    const cuerpo = datos.subarray(inicio, fin);
    if (id.valor === ID.CodecID) esOpus = new TextDecoder().decode(cuerpo) === "A_OPUS";
    else if (id.valor === ID.CodecPrivate) cabecera = cuerpo.slice();
    else if (id.valor === ID.Channels) canales = cuerpo[0] || 1;
    else if (id.valor === ID.SimpleBlock || id.valor === ID.Block) {
      const pista = leerVint(cuerpo, 0, true);
      const banderas = cuerpo[pista.largo + 2];
      if (banderas & 0x06) throw new ErrorOgg("paquetes agrupados");
      const paquete = cuerpo.subarray(pista.largo + 3);
      if (paquete.length) paquetes.push(paquete.slice());
    }
    p = fin;
  }
  if (!esOpus) throw new ErrorOgg("no es opus");
  if (!paquetes.length) throw new ErrorOgg("sin audio");
  return { cabecera, canales, paquetes };
}

/** Muestras (a 48 kHz) de un paquete Opus, según su byte TOC (RFC 6716, 3.1). */
export function muestrasOpus(paquete: Uint8Array): number {
  const toc = paquete[0];
  const config = toc >> 3;
  const ms = config < 12 ? [10, 20, 40, 60][config % 4] : config < 16 ? [10, 20][config % 2] : [2.5, 5, 10, 20][config % 4];
  const c = toc & 3;
  const marcos = c === 0 ? 1 : c < 3 ? 2 : (paquete[1] ?? 0) & 0x3f;
  return Math.round(ms * 48) * marcos;
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

export function crcOgg(b: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < b.length; i++) crc = ((crc << 8) ^ TABLA_CRC[((crc >>> 24) ^ b[i]) & 0xff]) >>> 0;
  return crc >>> 0;
}

function pagina(paquetes: Uint8Array[], granulo: number, serie: number, numero: number, tipo: number): Uint8Array {
  const segmentos: number[] = [];
  for (const q of paquetes) {
    let n = q.length;
    while (n >= 255) {
      segmentos.push(255);
      n -= 255;
    }
    segmentos.push(n);
  }
  const cuerpo = paquetes.reduce((s, q) => s + q.length, 0);
  const out = new Uint8Array(27 + segmentos.length + cuerpo);
  const v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  out[4] = 0;
  out[5] = tipo;
  v.setUint32(6, granulo % 2 ** 32, true);
  v.setUint32(10, Math.floor(granulo / 2 ** 32), true);
  v.setUint32(14, serie, true);
  v.setUint32(18, numero, true);
  out[26] = segmentos.length;
  out.set(segmentos, 27);
  let p = 27 + segmentos.length;
  for (const q of paquetes) {
    out.set(q, p);
    p += q.length;
  }
  v.setUint32(22, crcOgg(out), true);
  return out;
}

function cabeceraPorDefecto(canales: number): Uint8Array {
  const h = new Uint8Array(19);
  h.set(new TextEncoder().encode("OpusHead"), 0);
  const v = new DataView(h.buffer);
  h[8] = 1;
  h[9] = canales;
  v.setUint16(10, 312, true); // pre-skip típico del codificador
  v.setUint32(12, 48000, true);
  return h;
}

function etiquetas(): Uint8Array {
  const vendedor = new TextEncoder().encode("asistente");
  const t = new Uint8Array(8 + 4 + vendedor.length + 4);
  t.set(new TextEncoder().encode("OpusTags"), 0);
  new DataView(t.buffer).setUint32(8, vendedor.length, true);
  t.set(vendedor, 12);
  return t;
}

/** Arma el archivo Ogg/Opus. `serie` fija sirve para las pruebas. */
export function oggDesdePaquetes(cabecera: Uint8Array | null, canales: number, paquetes: Uint8Array[], serie = 0x5a17e0a1): Uint8Array {
  const head = cabecera && cabecera.length >= 19 && new TextDecoder().decode(cabecera.subarray(0, 8)) === "OpusHead" ? cabecera : cabeceraPorDefecto(canales);
  const paginas: Uint8Array[] = [pagina([head], 0, serie, 0, 0x02), pagina([etiquetas()], 0, serie, 1, 0)];
  const preskip = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(10, true);
  let granulo = preskip;
  let numero = 2;
  let lote: Uint8Array[] = [];
  let segmentos = 0;
  for (const [i, q] of paquetes.entries()) {
    const segs = Math.floor(q.length / 255) + 1;
    if (lote.length && (segmentos + segs > 255 || lote.length >= 50)) {
      paginas.push(pagina(lote, granulo, serie, numero++, 0));
      lote = [];
      segmentos = 0;
    }
    lote.push(q);
    segmentos += segs;
    granulo += muestrasOpus(q);
    if (i === paquetes.length - 1) paginas.push(pagina(lote, granulo, serie, numero++, 0x04));
  }
  const total = paginas.reduce((s, x) => s + x.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const x of paginas) {
    out.set(x, p);
    p += x.length;
  }
  return out;
}

/** WebM/Opus grabado → Ogg/Opus. Lanza ErrorOgg si no se puede (entonces se manda el audio tal cual). */
export function webmAOgg(datos: Uint8Array): Uint8Array {
  const { cabecera, canales, paquetes } = leerWebmOpus(datos);
  return oggDesdePaquetes(cabecera, canales, paquetes);
}

/** Segundos de un Ogg/Opus armado aquí (para mostrar la duración). */
export function segundosDePaquetes(paquetes: Uint8Array[]): number {
  return paquetes.reduce((s, q) => s + muestrasOpus(q), 0) / 48000;
}
