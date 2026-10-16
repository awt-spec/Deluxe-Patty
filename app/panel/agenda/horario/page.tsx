import Link from "next/link";
import { diaLargo, etiquetaHorario } from "@/lib/agenda/formato";
import { minutosLocales } from "@/lib/agenda/tiempo";
import { DIAS_SEMANA } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { agregarBloqueo, agregarFranja, guardarReglasVisitas, quitarBloqueo, quitarFranja } from "./acciones";

type Franja = { id: string; dia_semana: number; hora_inicio: string; hora_fin: string };
type Bloqueo = { id: string; inicio: string; fin: string; motivo: string | null };

/** "jueves 24 de diciembre al sábado 26 de diciembre" si son días completos; si no, con horas. */
function rango(b: Bloqueo, zona: string): string {
  const inicio = new Date(b.inicio);
  const fin = new Date(b.fin);
  if (minutosLocales(inicio, zona) === 0 && minutosLocales(fin, zona) === 0) {
    const primero = diaLargo(inicio, zona);
    const ultimo = diaLargo(new Date(fin.getTime() - 1), zona);
    return primero === ultimo ? `${primero}, todo el día` : `${primero} al ${ultimo}`;
  }
  return `${etiquetaHorario(inicio, zona)} → ${etiquetaHorario(fin, zona)}`;
}

// Lunes primero, como se lee una semana de trabajo.
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

export default async function Horario({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const [{ data: franjas }, { data: bloqueos }] = await Promise.all([
    supabase
      .from("horarios_visitas")
      .select("id, dia_semana, hora_inicio, hora_fin")
      .eq("corredor_id", corredor.id)
      .order("hora_inicio"),
    supabase
      .from("bloqueos_agenda")
      .select("id, inicio, fin, motivo")
      .eq("corredor_id", corredor.id)
      .gt("fin", new Date().toISOString())
      .order("inicio"),
  ]);
  const porDia = (d: number) => ((franjas ?? []) as Franja[]).filter((f) => f.dia_semana === d);

  return (
    <>
      <p>
        <Link href="/panel/agenda" className="suave">
          ← Agenda
        </Link>
      </p>
      <header className="encabezado">
        <h1>Horario de visitas</h1>
      </header>
      <Aviso texto={aviso} />
      <p className="suave">La asistente solo ofrece visitas dentro de estas franjas y fuera de los bloqueos.</p>

      <section className="tarjeta">
        {ORDEN.map((d) => (
          <div key={d} className="franja">
            <strong style={{ width: 92 }}>{DIAS_SEMANA[d]}</strong>
            <div className="pila" style={{ flex: 1, gap: 4 }}>
              {porDia(d).length === 0 && <span className="suave">Sin visitas</span>}
              {porDia(d).map((f) => (
                <form key={f.id} action={quitarFranja} className="fila">
                  <span>
                    {f.hora_inicio.slice(0, 5)} a {f.hora_fin.slice(0, 5)}
                  </span>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="chico peligro" aria-label={`Quitar ${DIAS_SEMANA[d]} ${f.hora_inicio.slice(0, 5)}`}>
                    Quitar
                  </button>
                </form>
              ))}
            </div>
          </div>
        ))}
      </section>

      <form action={agregarFranja} className="pila tarjeta">
        <h2 style={{ marginTop: 0 }}>Agregar franja</h2>
        <label htmlFor="dia">Día</label>
        <select id="dia" name="dia" defaultValue="1">
          {ORDEN.map((d) => (
            <option key={d} value={d}>
              {DIAS_SEMANA[d]}
            </option>
          ))}
        </select>
        <div className="fila campos">
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="desde">Desde</label>
            <input id="desde" name="desde" type="time" required defaultValue="09:00" />
          </div>
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="hasta">Hasta</label>
            <input id="hasta" name="hasta" type="time" required defaultValue="12:00" />
          </div>
        </div>
        <button type="submit" className="primario">
          Agregar
        </button>
      </form>

      <h2>Bloqueos</h2>
      <p className="suave">Vacaciones, citas médicas, otros compromisos: esas horas no se ofrecen.</p>
      {((bloqueos ?? []) as Bloqueo[]).map((b) => (
        <form key={b.id} action={quitarBloqueo} className="tarjeta fila">
          <div>
            <strong>{b.motivo ?? "Bloqueado"}</strong>
            <p className="suave">
              {rango(b, zona)}
            </p>
          </div>
          <input type="hidden" name="id" value={b.id} />
          <button type="submit" className="chico peligro">
            Quitar
          </button>
        </form>
      ))}
      <form action={agregarBloqueo} className="pila tarjeta">
        <h3>Bloquear fechas</h3>
        <div className="fila campos">
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="fecha_desde">Desde el</label>
            <input id="fecha_desde" name="fecha_desde" type="date" required />
          </div>
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="fecha_hasta">Hasta el</label>
            <input id="fecha_hasta" name="fecha_hasta" type="date" />
          </div>
        </div>
        <details>
          <summary>Solo unas horas</summary>
          <div className="fila campos">
            <div className="pila" style={{ flex: 1 }}>
              <label htmlFor="hora_desde">Desde las</label>
              <input id="hora_desde" name="hora_desde" type="time" />
            </div>
            <div className="pila" style={{ flex: 1 }}>
              <label htmlFor="hora_hasta">Hasta las</label>
              <input id="hora_hasta" name="hora_hasta" type="time" />
            </div>
          </div>
        </details>
        <label htmlFor="motivo">Motivo (solo lo ves tú)</label>
        <input id="motivo" name="motivo" type="text" placeholder="Vacaciones" />
        <button type="submit" className="primario">
          Bloquear
        </button>
      </form>

      <h2>Cómo se agendan</h2>
      <form action={guardarReglasVisitas} className="pila tarjeta">
        <div className="fila campos">
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="duracion">Duración de la visita (min)</label>
            <input id="duracion" name="duracion" type="number" inputMode="numeric" defaultValue={corredor.duracion_visita_min} />
          </div>
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="margen">Tiempo entre visitas (min)</label>
            <input id="margen" name="margen" type="number" inputMode="numeric" defaultValue={corredor.margen_visitas_min} />
          </div>
        </div>
        <div className="fila campos">
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="anticipacion">Aviso mínimo (horas)</label>
            <input id="anticipacion" name="anticipacion" type="number" inputMode="numeric" defaultValue={corredor.anticipacion_min_horas} />
          </div>
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="horizonte">Ofrecer hasta (días)</label>
            <input id="horizonte" name="horizonte" type="number" inputMode="numeric" defaultValue={corredor.horizonte_agenda_dias} />
          </div>
        </div>
        <button type="submit">Guardar</button>
      </form>
    </>
  );
}
