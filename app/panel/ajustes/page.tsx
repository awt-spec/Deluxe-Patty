import Link from "next/link";
import { fechaCorta } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { guardarAjustes, salir } from "../acciones";
import { Aviso } from "../aviso";

type Corredor = {
  zonas_e24: string[];
  precio_busqueda_min: number | null;
  precio_busqueda_max: number | null;
};

export default async function Ajustes({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor, usuario } = await sesionConCorredor();
  const [{ data: extra }, { data: mes }, { data: dias }] = await Promise.all([
    supabase.from("corredores").select("zonas_e24, precio_busqueda_min, precio_busqueda_max").eq("id", corredor.id).single(),
    supabase
      .from("uso_mensual")
      .select("mes, mensajes_total, llamadas_claude, costo_claude_usd, fotos_mejoradas")
      .order("mes", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("uso_diario").select("dia, mensajes, costo_claude_usd").order("dia", { ascending: false }).limit(7),
  ]);
  const busqueda = (extra ?? { zonas_e24: [], precio_busqueda_min: null, precio_busqueda_max: null }) as Corredor;
  const usados = (mes?.mensajes_total as number | undefined) ?? 0;

  return (
    <>
      <p>
        <Link href="/panel/mas" className="suave">
          ← Más
        </Link>
      </p>
      <header className="encabezado">
        <h1>Ajustes</h1>
      </header>
      <Aviso texto={aviso} />

      <form action={guardarAjustes} className="pila">
        <h2>Respuestas</h2>
        <label className="casilla">
          <input type="checkbox" name="respuesta_automatica" defaultChecked={corredor.respuesta_automatica} />
          La asistente contesta sola
        </label>
        <p className="suave">
          Apagado = piloto en sombra: cada respuesta queda como borrador hasta que la apruebes.
        </p>

        <label htmlFor="tono">Cómo escribe la asistente</label>
        <textarea
          id="tono"
          name="tono"
          defaultValue={corredor.tono}
          placeholder="Ejemplo: cordial y profesional, trato de usted, mensajes cortos, sin emojis."
        />
        <p className="suave">Las correcciones que haces a los borradores también le enseñan tu tono.</p>

        <label htmlFor="reglas">Temas que siempre te pasa a ti (uno por línea)</label>
        <textarea id="reglas" name="reglas" rows={5} defaultValue={corredor.reglas_escalamiento.join("\n")} />

        <h2>Plan del día</h2>
        <label htmlFor="hora_plan">Hora en que te llega</label>
        <input id="hora_plan" name="hora_plan" type="time" defaultValue={corredor.hora_plan_dia.slice(0, 5)} />

        <h2>Búsqueda de dueños</h2>
        <label htmlFor="zonas_e24">Zonas de Encuentra24 (una por línea, como en la dirección del sitio)</label>
        <textarea
          id="zonas_e24"
          name="zonas_e24"
          defaultValue={busqueda.zonas_e24.join("\n")}
          placeholder="san-jose-provincia-escazu"
        />
        <div className="fila">
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="precio_min">Precio mínimo (USD)</label>
            <input id="precio_min" name="precio_min" type="number" inputMode="numeric" defaultValue={busqueda.precio_busqueda_min ?? ""} />
          </div>
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="precio_max">Precio máximo (USD)</label>
            <input id="precio_max" name="precio_max" type="number" inputMode="numeric" defaultValue={busqueda.precio_busqueda_max ?? ""} />
          </div>
        </div>

        <button type="submit" className="primario">
          Guardar
        </button>
      </form>

      <h2>Uso del mes</h2>
      <div className="tarjeta pila">
        <div className="fila">
          <span>Mensajes de WhatsApp</span>
          <strong>
            {usados} de {corredor.tope_mensajes_mes}
          </strong>
        </div>
        <div className="fila">
          <span>Fotos mejoradas</span>
          <strong>{(mes?.fotos_mejoradas as number | undefined) ?? 0}</strong>
        </div>
      </div>
      {(dias ?? []).length > 0 && (
        <table className="uso">
          <thead>
            <tr>
              <th>Día</th>
              <th>Mensajes</th>
              <th>Costo IA (USD)</th>
            </tr>
          </thead>
          <tbody>
            {(dias ?? []).map((d) => (
              <tr key={d.dia as string}>
                <td>{fechaCorta(d.dia as string)}</td>
                <td>{d.mensajes as number}</td>
                <td>{Number(d.costo_claude_usd).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Cuenta</h2>
      <form action={salir} className="pila">
        <p className="suave">Entraste como {usuario.email}.</p>
        <button type="submit">Salir</button>
      </form>
    </>
  );
}
