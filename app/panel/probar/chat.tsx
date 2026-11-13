"use client";

import { useEffect, useRef, useState } from "react";
import { ESTADO_INICIAL, type EstadoSimulacion, type TurnoSimulado } from "@/lib/simulador/estado";
import { probarTurno } from "./acciones";
import { claveProbar, leerPrueba, serializarPrueba, ultimoIdRespuesta, type Calificaciones, type Linea } from "@/lib/simulador/guardado";
import { Calificar, ResumenCalificacion } from "./calificar-respuesta";

const INTENCION: Record<string, string> = {
  consulta_propiedad: "consulta",
  agendar_visita: "agenda",
  pasar_a_corredor: "para ti",
  otro: "otro",
};

const AGENDA: Record<string, string> = {
  propuesto: "propuso horarios",
  agendado: "agendó una visita de prueba",
  cancelado: "canceló la visita de prueba",
  asistencia_confirmada: "confirmó la asistencia",
  respondido: "respondió sin agendar",
};

function nota(t: TurnoSimulado): string {
  if (t.resultado === "sin_respuesta") return "La conversación ya es tuya: la asistente no contesta.";
  const partes = [t.intencion ? `Intención: ${INTENCION[t.intencion] ?? t.intencion}` : null];
  if (t.resultado === "escalado") partes.push("te la pasó a ti");
  if (t.accionAgenda) partes.push(AGENDA[t.accionAgenda] ?? t.accionAgenda);
  if (t.error) partes.push("hubo un error y te la pasó a ti");
  return partes.filter(Boolean).join(" · ");
}

const SUGERENCIAS = [
  "Hola, ¿qué propiedades tienen disponibles?",
  "Quisiera ver una propiedad esta semana",
  "¿Me hacen un descuento si pago de contado?",
];

let siguienteId = 0;

export function Chat({ nombreCorredor, corredorId }: { nombreCorredor: string; corredorId: string }) {
  const [estado, setEstado] = useState<EstadoSimulacion>(ESTADO_INICIAL);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Calificaciones y nota de la prueba: viven con la conversación, solo en el navegador.
  const [calificaciones, setCalificaciones] = useState<Calificaciones>({});
  const [notaPrueba, setNotaPrueba] = useState<number | null>(null);
  const final = useRef<HTMLDivElement>(null);
  // La prueba se recuerda en este navegador (24 h): se lee ya montado, para no desajustar la hidratación.
  const [cargado, setCargado] = useState(false);
  const clave = claveProbar(corredorId);

  useEffect(() => {
    try {
      const p = leerPrueba(localStorage.getItem(clave), Date.now());
      if (p) {
        /* eslint-disable react-hooks/set-state-in-effect -- localStorage solo existe en el navegador: se lee ya montado para no desajustar la hidratación */
        siguienteId = Math.max(siguienteId, ultimoIdRespuesta(p.lineas));
        setEstado(p.estado);
        setLineas(p.lineas);
        setCalificaciones(p.calificaciones);
        setNotaPrueba(p.nota);
        /* eslint-enable react-hooks/set-state-in-effect */
      } else localStorage.removeItem(clave);
    } catch {}
    setCargado(true);
  }, [clave]);

  useEffect(() => {
    if (!cargado) return;
    try {
      if (lineas.length === 0) localStorage.removeItem(clave);
      else localStorage.setItem(clave, serializarPrueba({ estado, lineas, calificaciones, nota: notaPrueba }, Date.now()));
    } catch {}
  }, [cargado, clave, estado, lineas, calificaciones, notaPrueba]);

  // Con llaves: en los Chrome nuevos scrollIntoView devuelve una promesa, y si el efecto la devuelve React
  // la toma por la función de limpieza y la página se cae ("destroy is not a function").
  useEffect(() => {
    final.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lineas, ocupado]);

  async function enviar(mensaje: string) {
    const limpio = mensaje.trim();
    if (!limpio || ocupado) return;
    setError(null);
    setOcupado(true);
    setTexto("");
    setLineas((l) => [...l, { tipo: "cliente", texto: limpio }]);
    try {
      const r = await probarTurno(estado, limpio);
      if ("error" in r) {
        setError(r.error);
        setLineas((l) => l.slice(0, -1));
        setTexto(limpio);
        return;
      }
      setEstado(r.estado);
      setLineas((l) => [
        ...l,
        ...r.turno.respuestas.map((t) => ({ tipo: "asistente" as const, texto: t, id: `r${++siguienteId}`, pregunta: limpio })),
        ...r.turno.avisos.map((t) => ({ tipo: "aviso" as const, texto: t })),
        { tipo: "nota" as const, texto: nota(r.turno) },
      ]);
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
      setLineas((l) => l.slice(0, -1));
      setTexto(limpio);
    } finally {
      setOcupado(false);
    }
  }

  const hayRespuestas = lineas.some((l) => l.tipo === "asistente");

  return (
    <div className="pila probar-chat">
      <section className="hilo" aria-label="Conversación de prueba" aria-live="polite">
        {lineas.length === 0 && (
          <div className="pila">
            <p className="suave">Para empezar, escribe algo o toca una de estas:</p>
            <div className="botones">
              {SUGERENCIAS.map((s) => (
                <button key={s} type="button" className="chico" onClick={() => void enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {lineas.map((l, i) =>
          l.tipo === "nota" ? (
            <p key={i} className="nota-prueba">
              {l.texto}
            </p>
          ) : l.tipo === "aviso" ? (
            <div key={i} className="burbuja aviso-prueba">
              <span className="etiqueta">Aviso a {nombreCorredor}</span>
              {"\n"}
              {l.texto}
            </div>
          ) : l.tipo === "asistente" ? (
            <div key={l.id} className="respuesta-calificable">
              <div className="burbuja cliente">
                {l.texto}
                <span className="meta">Asistente</span>
              </div>
              <Calificar
                id={l.id}
                respuesta={l.texto}
                pregunta={l.pregunta}
                calificacion={calificaciones[l.id]}
                ocupado={ocupado}
                onCambiar={(c) => setCalificaciones((todas) => ({ ...todas, [l.id]: c }))}
                onProbarOtraVez={() => void enviar(l.pregunta)}
              />
            </div>
          ) : (
            <div key={i} className="burbuja saliente">
              {l.texto}
              <span className="meta">Tú, como cliente</span>
            </div>
          ),
        )}
        {ocupado && <p className="nota-prueba">La asistente está escribiendo…</p>}
        <div ref={final} />
      </section>

      {hayRespuestas && <ResumenCalificacion calificaciones={calificaciones} nota={notaPrueba} onNota={setNotaPrueba} />}

      {error && (
        <p className="aviso" role="alert">
          {error}
        </p>
      )}
      <form
        className="pila tarjeta"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <label htmlFor="mensaje-prueba">Tu mensaje como cliente</label>
        <textarea
          id="mensaje-prueba"
          rows={3}
          value={texto}
          maxLength={1000}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar(texto);
            }
          }}
        />
        <div className="botones">
          <button type="submit" className="primario" disabled={ocupado || !texto.trim()}>
            Enviar
          </button>
          <button
            type="button"
            disabled={ocupado || lineas.length === 0}
            onClick={() => {
              setEstado(ESTADO_INICIAL);
              setLineas([]);
              setError(null);
              setCalificaciones({});
              setNotaPrueba(null);
              try {
                localStorage.removeItem(clave);
              } catch {}
            }}
          >
            Empezar otra prueba
          </button>
        </div>
      </form>
    </div>
  );
}
