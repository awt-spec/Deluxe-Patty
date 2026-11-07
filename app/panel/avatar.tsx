// Foto redonda con la inicial, como en WhatsApp. Cada cliente tiene siempre el mismo color (sale de su
// nombre o teléfono), para reconocerlo de un vistazo en la lista.
const COLORES = ["#25a18e", "#d1495b", "#3d7ea6", "#e09f3e", "#7b5ea7", "#5c946e", "#c2185b", "#00838f"];

/** Color e inicial del cliente (los mismos que su foto redonda). */
export function colorEInicial(nombre: string | null, telefono: string): { color: string; inicial: string } {
  const clave = nombre ?? telefono;
  let h = 0;
  for (const c of clave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { color: COLORES[h % COLORES.length], inicial: nombre?.trim().charAt(0).toUpperCase() || "#" };
}

export function Avatar({ nombre, telefono, grande = false }: { nombre: string | null; telefono: string; grande?: boolean }) {
  const clave = nombre ?? telefono;
  let h = 0;
  for (const c of clave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const inicial = nombre?.trim().charAt(0).toUpperCase() || "#";
  return (
    <span className={`avatar${grande ? " grande" : ""}`} style={{ background: COLORES[h % COLORES.length] }} aria-hidden>
      {inicial}
    </span>
  );
}
