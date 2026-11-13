import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZONAS_CONOCIDAS } from "@/lib/agenda/zonas";
import { PREFIJO_UBICACION, leerTemaUbicacion, type PreguntaUbicacion } from "@/lib/sitio/ubicacion";
import { confirmarUbicacion } from "./acciones";
import "./ubicacion.css";

// "¿Dónde queda esta casa?": las casas del sitio cuya zona no quedó clara (el título y el distrito no coinciden,
// un nombre que existe en dos lugares, una zona muy general). Un toque elige la zona; "Otra zona" abre la lista.
// La pregunta vive en el cerebro (`conocimiento`, tema "Ubicación <código>: …", pendiente).

export type CasaPorUbicar = PreguntaUbicacion & { id: string; zona: string | null };

/** Las preguntas de ubicación pendientes del corredor, con su casa (solo las que existen). */
export async function casasPorUbicar(supabase: SupabaseClient, corredorId: string, casas: { id: string; codigo: string; zona: string | null }[]): Promise<CasaPorUbicar[]> {
  const { data } = await supabase
    .from("conocimiento")
    .select("tema")
    .eq("corredor_id", corredorId)
    .eq("estado", "pendiente")
    .like("tema", `${PREFIJO_UBICACION}%`)
    .limit(100);
  const porCodigo = new Map(casas.map((c) => [c.codigo.toUpperCase(), c]));
  const salida: CasaPorUbicar[] = [];
  for (const fila of (data ?? []) as { tema: string }[]) {
    const p = leerTemaUbicacion(fila.tema);
    const casa = p && porCodigo.get(p.codigo);
    if (p && casa && !salida.some((s) => s.id === casa.id)) salida.push({ ...p, id: casa.id, zona: casa.zona });
  }
  return salida;
}

export function PreguntaUbicacion({
  casa,
  nombre,
  volverA,
  resto = 0,
  siguiente,
}: {
  casa: CasaPorUbicar;
  nombre: string;
  volverA: "lista" | "ficha";
  /** Cuántas más quedan por confirmar (en la lista). */
  resto?: number;
  /** Enlace para pasar a la siguiente. */
  siguiente?: string;
}) {
  const opciones = casa.opciones.length ? casa.opciones : casa.zona ? [casa.zona] : [];
  const boton = (zona: string) => (
    <form key={zona} action={confirmarUbicacion}>
      <input type="hidden" name="id" value={casa.id} />
      <input type="hidden" name="zona" value={zona} />
      <input type="hidden" name="volver_a" value={volverA} />
      <button type="submit" className="chico">
        {zona}
      </button>
    </form>
  );
  return (
    <section className="tarjeta pregunta-bloqueo pregunta-ubicacion" data-patty="pregunta-ubicacion">
      <p>
        <strong>{nombre}:</strong> ¿Dónde queda esta casa? Así calculo bien el traslado de las visitas.
      </p>
      <p className="pregunta-ubicacion-casa">
        {volverA === "lista" ? <Link href={`/panel/propiedades/${casa.id}`}>{casa.titulo}</Link> : <strong>{casa.titulo}</strong>}
        <span className="suave"> · {casa.codigo}</span>
      </p>
      <p className="suave pregunta-ubicacion-sitio">
        El sitio dice: «{casa.sitio}»{casa.zona ? `. Por ahora la tengo en ${casa.zona}.` : "."}
      </p>
      <div className="pregunta-bloqueo-botones">
        {opciones.map(boton)}
        <details className="pregunta-ubicacion-otra">
          <summary className="boton chico">Otra zona</summary>
          <form action={confirmarUbicacion}>
            <input type="hidden" name="id" value={casa.id} />
            <input type="hidden" name="volver_a" value={volverA} />
            <label>
              <span className="suave">Zona</span>
              <select name="zona" defaultValue={casa.zona ?? ""} required>
                <option value="" disabled>
                  Elige la zona
                </option>
                {ZONAS_CONOCIDAS.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="chico primario">
              Guardar
            </button>
          </form>
        </details>
        {siguiente && resto > 0 && (
          <Link href={siguiente} className="chico enlace">
            Después ({resto} más)
          </Link>
        )}
      </div>
    </section>
  );
}

/** La marca en la ficha de la casa. */
export function MarcaUbicacion() {
  return <span className="marca-ubicacion">Ubicación por confirmar</span>;
}
