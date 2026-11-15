// Lee un cuerpo (pedido entrante o descarga) contando bytes mientras llegan: al pasar el tope corta el stream y
// devuelve null, sin juntar en memoria más de lo permitido (un cuerpo "chunked" no trae content-length).

export async function leerConTope(cuerpo: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array | null> {
  if (!cuerpo) return new Uint8Array(0);
  const lector = cuerpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await lector.cancel().catch(() => undefined);
        return null;
      }
      partes.push(value);
    }
  } finally {
    lector.releaseLock();
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    todo.set(p, pos);
    pos += p.byteLength;
  }
  return todo;
}
