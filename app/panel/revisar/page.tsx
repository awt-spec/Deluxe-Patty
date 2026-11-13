import Link from "next/link";
import { conPunto, etiquetaHorario } from "@/lib/agenda/formato";
import type { AccionPendiente } from "@/lib/datos/tipos";
import { pendientesDe } from "@/lib/panel/pendientes";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { aprobar, descartar, devolver, yoLeEscribo } from "../acciones";
import { Aviso } from "../aviso";
import { Avatar } from "../avatar";
import { BotonEnviar } from "../boton-enviar";
import { IconoFlecha, IconoCheck } from "../iconos";
import { Volver } from "../volver";
import { EncabezadoPagina } from "../piezas";

// Revisar lo que espera a la corredora, uno a la vez: lo que dijo el cliente, lo que la asistente le
// contestaría (se puede cambiar ahí mismo) y tres botones. Al resolver uno aparece el siguiente.

function queHace(a: AccionPendiente, zona: string): string {
  if (a.tipo === "crear_cita") return conPunto(`Al enviarla queda agendada la visita del ${etiquetaHorario(new Date(a.inicio), zona)}`);
  if (a.tipo === "cancelar_cita") return "Al enviarla se cancela la visita.";
  return "Al enviarla la visita queda confirmada.";
}

export default async function Revisar({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const pendientes = await pendientesDe(supabase, corredor.id);
  const p = pendientes[0];

  if (!p) {
    return (
      <>
        <Volver href="/panel" texto="Inicio" />
        <Aviso texto={aviso} />
        <div className="revisar-vacio">
          <IconoCheck tamano={48} />
          <h1>Todo al día</h1>
          <p className="suave">No hay respuestas por revisar.</p>
          <Link href="/panel" className="boton primario grande">
            Volver al inicio
          </Link>
        </div>
      </>
    );
  }

  const nombre = p.contacto.nombre ?? p.contacto.telefono;
  const asistente = corredor.nombre_asistente ?? "Patty";
  return (
    <>
      <div className="revisar-arriba">
        <Volver href="/panel" texto="Inicio" />
        <span className="revisar-quedan">
          <span className="suave">{pendientes.length === 1 ? "El último" : `Quedan ${pendientes.length}`}</span>
          {/* Un punto por cada uno que espera (hasta 8): se ve cuánto falta. */}
          <span className="revisar-puntos" aria-hidden>
            {pendientes.slice(0, 8).map((x, i) => (
              <i key={x.conversacionId + i} className={i === 0 ? "actual" : undefined} />
            ))}
          </span>
        </span>
      </div>
      <Aviso texto={aviso} />
      <EncabezadoPagina titulo="Revisar" apoyo={`Uno a la vez: lo que dijo el cliente y lo que ${asistente} le contestaría.`} className="revisar-encabezado" />

      <article className="revisar">
        <Link href={`/panel/conversaciones/${p.conversacionId}`} className="revisar-quien">
          <Avatar nombre={p.contacto.nombre} telefono={p.contacto.telefono} />
          <span className="revisar-quien-texto">
            <strong>{nombre}</strong>
            <span className={`revisar-tipo ${p.tipo}`}>{p.tipo === "respuesta" ? "Respuesta lista" : "Quiere hablar contigo"}</span>
          </span>
          <span className="revisar-ver">
            Ver el chat <IconoFlecha tamano={16} />
          </span>
        </Link>

        {p.dijo && (
          <div className="mini-hilo">
            <p className="burbuja cliente">{p.dijo}</p>
          </div>
        )}

        {p.tipo === "respuesta" ? (
          <form action={aprobar} className="pila">
            <input type="hidden" name="mensaje" value={p.mensajeId} />
            <input type="hidden" name="volver" value="/panel/revisar" />
            <label htmlFor="texto" className="revisar-etiqueta">
              {asistente} le contestaría
            </label>
            <textarea
              id="texto"
              name="texto"
              defaultValue={p.propuesta}
              rows={Math.min(10, Math.max(3, Math.ceil(p.propuesta.length / 40)))}
            />
            {p.accion && <p className="suave">{queHace(p.accion, corredor.zona_horaria)}</p>}
            {!p.abierta && <p className="aviso">Pasó más de un día: contéstale desde tu WhatsApp.</p>}
            <div className="revisar-botones">
              <button type="submit" formAction={descartar} className="peligro">
                No enviar
              </button>
              {p.abierta && <BotonEnviar texto={<><IconoCheck tamano={22} /> Enviar</>} pendiente="Enviando…" className="verde grande" />}
            </div>
            <button type="submit" formAction={yoLeEscribo} name="conversacion" value={p.conversacionId} className="enlace revisar-yo">
              Prefiero escribirle yo
            </button>
            <p className="suave revisar-ayuda">Puedes cambiar el texto antes de enviarlo.</p>
          </form>
        ) : (
          <div className="pila">
            <p className="revisar-etiqueta">Quiere hablar contigo</p>
            <a href={`https://wa.me/${p.contacto.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="boton verde grande">
              Escribirle por WhatsApp
            </a>
            <form action={devolver}>
              <input type="hidden" name="conversacion" value={p.conversacionId} />
              <input type="hidden" name="volver" value="/panel/revisar" />
              <BotonEnviar texto="Ya lo atendí" pendiente="Un momento…" className="grande" />
            </form>
          </div>
        )}
      </article>
    </>
  );
}
