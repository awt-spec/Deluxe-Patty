"use client";

import { useId, useState } from "react";
import {
  MAX_TEXTO_CALIFICACION,
  MOTIVOS,
  NADA,
  cosasEnsenadas,
  escribioSuVersion,
  fraseEnsenadas,
  fraseGuardado,
  fraseResumen,
  motivoDeDato,
  resumenPrueba,
  type Motivo,
} from "@/lib/simulador/calificar";
import { acumularPlan, enlacesCerebro, type CalificacionEnPrueba, type Calificaciones } from "@/lib/simulador/guardado";
import { IconoEstrella, IconoPulgarAbajo, IconoPulgarArriba } from "../iconos";
import { calificarRespuesta } from "./calificar";

export type { CalificacionEnPrueba, Calificaciones };

/** Los dos pulgares bajo el globo de la asistente y, con "No me gustó", la hojita para enseñarle. */
export function Calificar({
  id,
  respuesta,
  pregunta,
  calificacion,
  ocupado,
  onCambiar,
  onProbarOtraVez,
}: {
  id: string;
  respuesta: string;
  pregunta: string;
  calificacion: CalificacionEnPrueba | undefined;
  ocupado: boolean;
  onCambiar: (c: CalificacionEnPrueba | undefined) => void;
  onProbarOtraVez: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const valor = calificacion?.valor;
  return (
    <div className="calificar">
      <div className="calificar-fila" role="group" aria-label="Calificar esta respuesta">
        <button
          type="button"
          className={`pulgar${valor === "bien" ? " marcado bien" : ""}`}
          aria-label="Bien contestado"
          aria-pressed={valor === "bien"}
          title="Bien contestado"
          data-patty="probar-bien"
          onClick={() => {
            setAbierta(false);
            // Lo que ya le enseñó con esta respuesta sigue contando en el resumen.
            if (valor !== "bien") onCambiar({ valor: "bien", ensenadas: calificacion?.ensenadas, plan: calificacion?.plan });
          }}
        >
          <IconoPulgarArriba tamano={20} />
        </button>
        <button
          type="button"
          className={`pulgar${valor === "mal" ? " marcado mal" : ""}`}
          aria-label="No me gustó"
          aria-pressed={valor === "mal"}
          aria-expanded={abierta}
          aria-controls={`hoja-${id}`}
          title="No me gustó"
          data-patty="probar-mal"
          onClick={() => {
            // Queda marcada al tocarla; la hojita para enseñarle es opcional.
            if (valor !== "mal") onCambiar({ ...calificacion, valor: "mal" });
            setAbierta((a) => !a);
          }}
        >
          <IconoPulgarAbajo tamano={20} />
        </button>
        {valor && !abierta && <span className="calificar-marca">{valor === "bien" ? "Bien contestado" : "Por mejorar"}</span>}
      </div>

      {abierta && (
        <HojaNoMeGusto
          id={`hoja-${id}`}
          respuesta={respuesta}
          pregunta={pregunta}
          motivoInicial={calificacion?.motivo}
          onCerrar={() => setAbierta(false)}
          onListo={(c) => {
            // Lo ya guardado en el Cerebro no se deshace al cambiar de motivo: el plan se acumula.
            onCambiar({ ...c, ensenadas: (calificacion?.ensenadas ?? 0) + (c.ensenadas ?? 0), plan: c.plan ? acumularPlan(calificacion?.plan, c.plan) : calificacion?.plan });
            setAbierta(false);
          }}
        />
      )}

      {!abierta && valor === "mal" && calificacion?.frase && (
        <div className="calificar-resultado" role="status">
          <p>{calificacion.frase}</p>
          {calificacion.plan?.irAAjustes ? (
            <a className="boton chico" href="/panel/ajustes#reglas" data-patty="probar-ir-ajustes">
              Ir a Ajustes
            </a>
          ) : (
            (calificacion.ensenadas ?? 0) > 0 && (
              <button type="button" className="chico" disabled={ocupado} data-patty="probar-otra-vez" onClick={onProbarOtraVez}>
                Probar otra vez esta pregunta
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function HojaNoMeGusto({
  id,
  respuesta,
  pregunta,
  motivoInicial,
  onCerrar,
  onListo,
}: {
  id: string;
  respuesta: string;
  pregunta: string;
  motivoInicial: Motivo | undefined;
  onCerrar: () => void;
  onListo: (c: CalificacionEnPrueba) => void;
}) {
  const base = useId();
  const [motivo, setMotivo] = useState<Motivo | null>(motivoInicial ?? null);
  const [texto, setTexto] = useState(respuesta);
  const [enLoQueSabe, setEnLoQueSabe] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const escribio = escribioSuVersion(respuesta, texto);
  const dato = motivoDeDato(motivo);

  async function ensenar() {
    if (!motivo || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await calificarRespuesta({ motivo, pregunta, original: respuesta, texto, guardarEnLoQueSabe: dato && escribio && enLoQueSabe });
      if (!r.ok) return setError(r.error);
      onListo({ valor: "mal", motivo, ensenadas: cosasEnsenadas(r.plan), plan: r.plan, frase: fraseGuardado(r.plan) });
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div id={id} className="hoja-calificar pila" role="group" aria-labelledby={`${base}-titulo`}>
      <p id={`${base}-titulo`} className="hoja-titulo">
        ¿Qué estuvo mal?
      </p>
      <div className="motivos" data-patty="probar-motivos">
        {MOTIVOS.map((m) => (
          <button key={m.id} type="button" className={`motivo${motivo === m.id ? " elegido" : ""}`} aria-pressed={motivo === m.id} onClick={() => setMotivo(m.id)}>
            {m.texto}
          </button>
        ))}
      </div>

      {motivo === "pasarmelo" ? (
        <>
          <p className="hoja-ayuda">
            Lo que la asistente te pasa a ti se elige en Ajustes, en «Temas que siempre te pasa a ti». Desde aquí no se cambia.
          </p>
          <div className="botones">
            <a className="boton primario" href="/panel/ajustes#reglas" data-patty="probar-ir-ajustes">
              Ir a Ajustes
            </a>
            <button
              type="button"
              onClick={() => {
                const plan = { ...NADA, irAAjustes: true };
                onListo({ valor: "mal", motivo, ensenadas: 0, plan, frase: fraseGuardado(plan) });
              }}
            >
              Listo
            </button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor={`${base}-texto`}>
            ¿Cómo lo habrías dicho tú? <span className="suave">(si quieres)</span>
          </label>
          <textarea
            id={`${base}-texto`}
            rows={5}
            value={texto}
            maxLength={MAX_TEXTO_CALIFICACION}
            data-patty="probar-como-lo-dirias"
            onFocus={(e) => {
              // En el teléfono el teclado tapa el campo: se centra cuando ya subió.
              const campo = e.currentTarget;
              setTimeout(() => campo.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
            }}
            onChange={(e) => setTexto(e.target.value)}
          />
          {dato && escribio && (
            <label className="hoja-casilla">
              <input type="checkbox" checked={enLoQueSabe} onChange={(e) => setEnLoQueSabe(e.target.checked)} />
              Guardarlo también en lo que sabe, para cuando otro cliente pregunte lo mismo
            </label>
          )}
          {dato && !escribio && <p className="hoja-ayuda">Si no escribes el dato, queda como pregunta en su cerebro para que la contestes luego.</p>}
          {error && (
            <p className="aviso" role="alert">
              {error}
            </p>
          )}
          <div className="botones">
            <button type="button" className="primario" disabled={!motivo || guardando} data-patty="probar-ensenar" onClick={() => void ensenar()}>
              {guardando ? "Guardando…" : "Enseñárselo"}
            </button>
            <button type="button" onClick={onCerrar}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** "Calificaste N respuestas…", la nota de la conversación y lo que le enseñó en esta prueba. */
export function ResumenCalificacion({
  calificaciones,
  nota,
  onNota,
}: {
  calificaciones: Calificaciones;
  nota: number | null;
  onNota: (n: number | null) => void;
}) {
  const r = resumenPrueba(calificaciones);
  const planes = Object.values(calificaciones).flatMap((c) => (c?.plan ? [c.plan] : []));
  const enlaces = enlacesCerebro(planes);
  return (
    <section className="resumen-prueba" aria-label="Resumen de la prueba" data-patty="probar-resumen">
      <p className="resumen-cifras">{fraseResumen(r)}</p>
      <div className="estrellas-fila">
        <span id="nota-prueba" className="suave">
          Nota de esta conversación
        </span>
        <div className="estrellas" role="radiogroup" aria-labelledby="nota-prueba" data-patty="probar-estrellas">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={nota === n}
              aria-label={`${n} de 5`}
              className={`estrella${nota !== null && n <= nota ? " llena" : ""}`}
              onClick={() => onNota(nota === n ? null : n)}
            >
              <IconoEstrella tamano={26} />
            </button>
          ))}
        </div>
      </div>
      {r.ensenadas > 0 && (
        <p className="resumen-ensenadas">
          {fraseEnsenadas(r.ensenadas)}.{" "}
          {enlaces.map((e, i) => (
            <span key={e.href}>
              {i > 0 && " · "}
              <a href={e.href} data-patty="probar-ver-cerebro">
                {e.texto}
              </a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
