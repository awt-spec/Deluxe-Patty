import Link from "next/link";
import { diaLargo, etiquetaHorario } from "@/lib/agenda/formato";
import { minutosLocales } from "@/lib/agenda/tiempo";
import {
  DIAS_SEMANA,
  TURNOS,
  esHorarioSencillo,
  turnosDelDia,
} from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import {
  agregarBloqueo,
  agregarFranja,
  guardarReglasVisitas,
  guardarTurnos,
  quitarBloqueo,
  quitarFranja,
} from "./acciones";

type Franja = {
  id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
};
type Bloqueo = {
  id: string;
  inicio: string;
  fin: string;
  motivo: string | null;
};

/** "jueves 24 de diciembre al sábado 26 de diciembre" si son días completos; si no, con horas. */
function rango(b: Bloqueo, zona: string): string {
  const inicio = new Date(b.inicio);
  const fin = new Date(b.fin);
  if (minutosLocales(inicio, zona) === 0 && minutosLocales(fin, zona) === 0) {
    const primero = diaLargo(inicio, zona);
    const ultimo = diaLargo(new Date(fin.getTime() - 1), zona);
    return primero === ultimo
      ? `${primero}, todo el día`
      : `${primero} al ${ultimo}`;
  }
  return `${etiquetaHorario(inicio, zona)} → ${etiquetaHorario(fin, zona)}`;
}

// Lunes primero, como se lee una semana de trabajo.
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

export default async function Horario({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
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
  const lista = (franjas ?? []) as Franja[];
  const porDia = (d: number) => lista.filter((f) => f.dia_semana === d);
  const sencillo = esHorarioSencillo(lista);

  return (
    <>
      <p>
        <Link href="/panel/agenda" className="suave">
          ← Agenda
        </Link>
      </p>
      <header className="encabezado">
        <h1>Mi horario</h1>
      </header>
      <Aviso texto={aviso} />

      <form action={guardarTurnos} className="pila tarjeta">
        <h2 style={{ marginTop: 0 }}>¿Qué días enseñas casas?</h2>
        <p className="suave">
          Toca para marcar. La asistente solo ofrece visitas en lo marcado.
        </p>
        {!sencillo && (
          <p className="aviso">
            Tienes horas especiales (abajo, en “Horas exactas”). Si guardas
            aquí, se cambian por mañana y tarde.
          </p>
        )}
        {ORDEN.map((d) => {
          const t = turnosDelDia(lista, d);
          return (
            <div key={d} className="dia-turnos">
              <strong>{DIAS_SEMANA[d]}</strong>
              <label className="chip">
                <input
                  type="checkbox"
                  name={`m${d}`}
                  defaultChecked={t.manana}
                />
                {TURNOS.manana.nombre}
              </label>
              <label className="chip">
                <input
                  type="checkbox"
                  name={`t${d}`}
                  defaultChecked={t.tarde}
                />
                {TURNOS.tarde.nombre}
              </label>
            </div>
          );
        })}
        <p className="suave">Mañana es de 8 a 12 y tarde de 1 a 5.</p>
        <button type="submit" className="primario grande">
          Guardar mi horario
        </button>
      </form>

      <form action={agregarBloqueo} className="pila tarjeta">
        <h2 style={{ marginTop: 0 }}>¿Un día no puedes?</h2>
        <label htmlFor="dia_libre">Ese día no se agendan visitas</label>
        <input id="dia_libre" name="fecha_desde" type="date" required />
        <input type="hidden" name="motivo" value="No disponible" />
        <button type="submit" className="grande">
          No puedo ese día
        </button>
      </form>
      {((bloqueos ?? []) as Bloqueo[]).length > 0 && (
        <h3>Días que no puedes</h3>
      )}
      {((bloqueos ?? []) as Bloqueo[]).map((b) => (
        <form key={b.id} action={quitarBloqueo} className="tarjeta fila">
          <div>
            <strong>{rango(b, zona)}</strong>
            {b.motivo && b.motivo !== "No disponible" && (
              <p className="suave">{b.motivo}</p>
            )}
          </div>
          <input type="hidden" name="id" value={b.id} />
          <button type="submit" className="chico">
            Sí puedo
          </button>
        </form>
      ))}

      <details style={{ marginTop: 20 }}>
        <summary>Horas exactas</summary>
        <section className="tarjeta">
          {ORDEN.map((d) => (
            <div key={d} className="franja">
              <strong style={{ width: 92 }}>{DIAS_SEMANA[d]}</strong>
              <div className="pila" style={{ flex: 1, gap: 4 }}>
                {porDia(d).length === 0 && (
                  <span className="suave">Sin visitas</span>
                )}
                {porDia(d).map((f) => (
                  <form key={f.id} action={quitarFranja} className="fila">
                    <span>
                      {f.hora_inicio.slice(0, 5)} a {f.hora_fin.slice(0, 5)}
                    </span>
                    <input type="hidden" name="id" value={f.id} />
                    <button
                      type="submit"
                      className="chico peligro"
                      aria-label={`Quitar ${DIAS_SEMANA[d]} ${f.hora_inicio.slice(0, 5)}`}
                    >
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
              <input
                id="desde"
                name="desde"
                type="time"
                required
                defaultValue="09:00"
              />
            </div>
            <div className="pila" style={{ flex: 1 }}>
              <label htmlFor="hasta">Hasta</label>
              <input
                id="hasta"
                name="hasta"
                type="time"
                required
                defaultValue="12:00"
              />
            </div>
          </div>
          <button type="submit" className="primario">
            Agregar
          </button>
        </form>
      </details>

      <details>
        <summary>Bloquear varios días o unas horas</summary>
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
          <input
            id="motivo"
            name="motivo"
            type="text"
            placeholder="Vacaciones"
          />
          <button type="submit" className="primario">
            Bloquear
          </button>
        </form>
      </details>

      <details>
        <summary>Duración de las visitas</summary>
        <form action={guardarReglasVisitas} className="pila tarjeta">
          <div className="fila campos">
            <div className="pila" style={{ flex: 1 }}>
              <label htmlFor="duracion">Duración de la visita (min)</label>
              <input
                id="duracion"
                name="duracion"
                type="number"
                inputMode="numeric"
                defaultValue={corredor.duracion_visita_min}
              />
            </div>
            <div className="pila" style={{ flex: 1 }}>
              <label htmlFor="margen">Tiempo entre visitas (min)</label>
              <input
                id="margen"
                name="margen"
                type="number"
                inputMode="numeric"
                defaultValue={corredor.margen_visitas_min}
              />
            </div>
          </div>
          <div className="fila campos">
            <div className="pila" style={{ flex: 1 }}>
              <label htmlFor="anticipacion">Aviso mínimo (horas)</label>
              <input
                id="anticipacion"
                name="anticipacion"
                type="number"
                inputMode="numeric"
                defaultValue={corredor.anticipacion_min_horas}
              />
            </div>
            <div className="pila" style={{ flex: 1 }}>
              <label htmlFor="horizonte">Ofrecer hasta (días)</label>
              <input
                id="horizonte"
                name="horizonte"
                type="number"
                inputMode="numeric"
                defaultValue={corredor.horizonte_agenda_dias}
              />
            </div>
          </div>
          <button type="submit">Guardar</button>
        </form>
      </details>
    </>
  );
}
