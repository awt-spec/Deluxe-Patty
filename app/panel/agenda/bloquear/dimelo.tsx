"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { transcribirNota } from "../../patty-acciones";
import { deshacerApartadosPanel, entenderApartadoPanel, guardarApartadosPanel, type Propuesta } from "./acciones";
import "./apartar-ia.css";

// "Dímelo con tus palabras": arriba de Apartar tiempo, un campo donde el corredor cuenta cuándo no puede ("el martes
// tengo dentista de 2 a 4 y el viernes no trabajo"). Lo entiende el código o, si no alcanza, la IA; siempre sale la
// tarjeta "Esto entendí" y nada se guarda hasta "Sí, apartarlo". Después, "Deshacer" mientras siga en la pantalla.

const MAX = 500;
const MAX_GRABACION_SEG = 120;
const EJEMPLOS = ["El martes tengo dentista de 2 a 4", "La otra semana estoy de vacaciones", "Mañana llego tarde, después de las 10", "Quita lo del viernes"];

type Guardado = { texto: string; ids: string[]; quitados: { inicio: string; fin: string; motivo: string | null }[]; deshecho?: boolean };

export function Dimelo({ asistente, propuestaInicial, enfocar }: { asistente: string; propuestaInicial?: string; enfocar?: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [fuera, setFuera] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [pendiente, empezar] = useTransition();
  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const caja = useRef<HTMLTextAreaElement>(null);
  const grabadora = useRef<{ rec: MediaRecorder; trozos: Blob[]; flujo: MediaStream; reloj: ReturnType<typeof setTimeout>; cancelado: boolean } | null>(null);
  const leido = useRef(false);

  useEffect(() => {
    if (enfocar) caja.current?.focus();
  }, [enfocar]);

  // Viene de Patty con la propuesta en el enlace: se revisa en el servidor sin volver a llamar a la IA.
  useEffect(() => {
    if (!propuestaInicial || leido.current) return;
    leido.current = true;
    empezar(async () => {
      const r = await entenderApartadoPanel("", propuestaInicial);
      if (r.ok) {
        setTexto(r.propuesta.texto);
        setPropuesta(r.propuesta);
      } else setError(r.motivo);
    });
  }, [propuestaInicial]);

  function entender(t: string) {
    const limpio = t.trim().slice(0, MAX);
    if (!limpio || pendiente) return;
    setError(null);
    setGuardado(null);
    setFuera([]);
    empezar(async () => {
      try {
        const r = await entenderApartadoPanel(limpio);
        if (r.ok) setPropuesta(r.propuesta);
        else setError(r.motivo);
      } catch {
        setError("No se pudo mandar. Revisa tu conexión e inténtalo de nuevo.");
      }
    });
  }

  function cambiar() {
    setPropuesta(null);
    setFuera([]);
    setTimeout(() => caja.current?.focus(), 30);
  }

  const apartados = propuesta?.apartados.filter((a) => !fuera.includes(a.clave)) ?? [];
  const quitar = propuesta?.quitar.filter((q) => !fuera.includes(q.id)) ?? [];
  const conDudas = (propuesta?.dudas.length ?? 0) > 0;
  const puedeGuardar = !!propuesta && !conDudas && apartados.length + quitar.length > 0;

  function confirmar() {
    if (!puedeGuardar || pendiente) return;
    empezar(async () => {
      try {
        const r = await guardarApartadosPanel(apartados, quitar.map((q) => q.id));
        if (!r.ok) return setError(r.motivo);
        setGuardado({ texto: r.texto, ids: r.ids, quitados: r.quitados });
        setPropuesta(null);
        setTexto("");
        router.refresh();
      } catch {
        setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
      }
    });
  }

  function deshacer() {
    if (!guardado || guardado.deshecho || pendiente) return;
    empezar(async () => {
      const r = await deshacerApartadosPanel(guardado.ids, guardado.quitados);
      if (!r.ok) return setError(r.motivo);
      setGuardado({ ...guardado, texto: r.texto, deshecho: true });
      router.refresh();
    });
  }

  async function empezarGrabacion() {
    if (grabadora.current) return;
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 });
      const trozos: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && trozos.push(e.data);
      rec.onstop = () => void terminarGrabacion();
      const reloj = setTimeout(() => pararGrabacion(false), MAX_GRABACION_SEG * 1000);
      grabadora.current = { rec, trozos, flujo, reloj, cancelado: false };
      setGrabando(true);
      rec.start();
    } catch {
      setError("No pude usar el micrófono. Revisa que el navegador tenga permiso.");
    }
  }

  function pararGrabacion(cancelar: boolean) {
    const g = grabadora.current;
    if (!g) return;
    g.cancelado = cancelar;
    clearTimeout(g.reloj);
    g.flujo.getTracks().forEach((t) => t.stop());
    if (g.rec.state !== "inactive") g.rec.stop();
    setGrabando(false);
  }

  async function terminarGrabacion() {
    const g = grabadora.current;
    grabadora.current = null;
    if (!g || g.cancelado || g.trozos.length === 0) return;
    const tipo = g.rec.mimeType || g.trozos[0].type || "audio/webm";
    setTranscribiendo(true);
    try {
      const fd = new FormData();
      fd.append("audio", new File([new Blob(g.trozos, { type: tipo })], `nota.${tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : "webm"}`, { type: tipo }));
      const r = await transcribirNota(fd);
      if (r.ok) {
        setTexto((t) => (t.trim() ? `${t.trim()} ${r.texto}` : r.texto).slice(0, MAX));
        caja.current?.focus();
      } else setError(r.motivo);
    } catch {
      setError("No se pudo mandar el audio. Inténtalo de nuevo.");
    }
    setTranscribiendo(false);
  }

  return (
    <section className="tarjeta apartar-ia" aria-labelledby="apartar-ia-titulo">
      {guardado && (
        <div className="apartar-ia-listo" role="status">
          <span>{guardado.texto}</span>
          {!guardado.deshecho && (guardado.ids.length > 0 || guardado.quitados.length > 0) && (
            <button type="button" className="chico" onClick={deshacer} disabled={pendiente} data-patty="apartar-ia-deshacer">
              Deshacer
            </button>
          )}
        </div>
      )}

      {!propuesta ? (
        <form
          className="apartar-ia-form"
          onSubmit={(e) => {
            e.preventDefault();
            entender(texto);
          }}
        >
          <label id="apartar-ia-titulo" htmlFor="apartar-ia-texto" className="apartar-ia-titulo">
            Cuéntame cuándo no puedes
          </label>
          <p className="suave apartar-ia-sub">Escríbelo o dilo como se lo dirías a {asistente}. Antes de guardar te muestro lo que entendí.</p>
          <div className="apartar-ia-caja">
            <textarea
              id="apartar-ia-texto"
              ref={caja}
              value={texto}
              maxLength={MAX}
              rows={3}
              placeholder="Ej.: el martes tengo dentista de 2 a 4 y el viernes no trabajo"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  entender(texto);
                }
              }}
              data-patty="apartar-ia-campo"
            />
            <button
              type="button"
              className={`apartar-ia-micro${grabando ? " grabando" : ""}`}
              onClick={() => (grabando ? pararGrabacion(false) : void empezarGrabacion())}
              disabled={transcribiendo || pendiente}
              aria-label={grabando ? "Terminar la nota de voz" : "Dictar con la voz"}
              data-patty="apartar-ia-microfono"
            >
              {transcribiendo ? <span className="apartar-ia-puntos" aria-hidden="true" /> : grabando ? <Cuadro /> : <Microfono />}
            </button>
          </div>
          {grabando && (
            <p className="apartar-ia-grabando" role="status">
              Te escucho… toca el botón otra vez para terminar.{" "}
              <button type="button" className="chico enlace" onClick={() => pararGrabacion(true)}>
                Cancelar
              </button>
            </p>
          )}
          <div className="apartar-ia-ejemplos" aria-label="Ejemplos">
            {EJEMPLOS.map((e) => (
              <button key={e} type="button" className="apartar-ia-ejemplo" onClick={() => (setTexto(e), caja.current?.focus())}>
                {e}
              </button>
            ))}
          </div>
          <button type="submit" className="primario grande apartar-ia-enviar" disabled={!texto.trim() || pendiente || grabando} data-patty="apartar-ia-enviar">
            {pendiente ? "Entendiendo…" : "Listo, revísalo"}
          </button>
        </form>
      ) : (
        <div className="apartar-ia-propuesta" aria-live="polite">
          <h2 id="apartar-ia-titulo">Esto entendí</h2>
          <p className="apartar-ia-dicho">«{propuesta.texto}»</p>
          {propuesta.aviso && <p className="apartar-ia-aviso">{propuesta.aviso}</p>}
          {propuesta.fuente === "demo" && <p className="suave apartar-ia-demo">En la demostración lo entiende una versión simple, sin IA.</p>}

          {apartados.length > 0 && (
            <ul className="apartar-ia-renglones">
              {apartados.map((a) => (
                <li key={a.clave} className={a.choques.length ? "con-choque" : undefined}>
                  <div className="apartar-ia-renglon">
                    <span>{a.texto}</span>
                    <button type="button" className="apartar-ia-x" aria-label={`Quitar ${a.texto} de la lista`} onClick={() => setFuera((f) => [...f, a.clave])}>
                      ×
                    </button>
                  </div>
                  {a.choques.map((c) => (
                    <Link key={c.id} href={`/panel/agenda/visita/${c.id}`} className="apartar-ia-choque">
                      {c.texto} <span>Ver la visita</span>
                    </Link>
                  ))}
                </li>
              ))}
            </ul>
          )}

          {quitar.length > 0 && (
            <>
              <h3 className="apartar-ia-sub-titulo">Voy a quitar lo apartado</h3>
              <ul className="apartar-ia-renglones quitar">
                {quitar.map((q) => (
                  <li key={q.id}>
                    <div className="apartar-ia-renglon">
                      <span>{q.texto}</span>
                      <button type="button" className="apartar-ia-x" aria-label={`No quitar ${q.texto}`} onClick={() => setFuera((f) => [...f, q.id])}>
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {propuesta.dudas.map((d) => (
            <div key={d.pregunta} className="apartar-ia-duda" role="group" aria-label="Una duda">
              <p>{d.pregunta}</p>
              {d.opciones.length > 0 && (
                <div className="apartar-ia-opciones">
                  {d.opciones.map((o) => (
                    <button key={o} type="button" className="chico" disabled={pendiente} onClick={() => entender(`${propuesta.texto} (${o})`)}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {propuesta.notas.map((n) => (
            <p key={n} className="suave apartar-ia-nota">
              {n}
            </p>
          ))}
          {!apartados.length && !quitar.length && !conDudas && <p className="suave">No quedó nada para apartar. Toca «Cambiar algo» y dímelo de otra forma.</p>}

          <div className="apartar-ia-botones">
            <button type="button" className="primario grande" onClick={confirmar} disabled={!puedeGuardar || pendiente} data-patty="apartar-ia-confirmar">
              {pendiente ? "Guardando…" : apartados.length ? "Sí, apartarlo" : "Sí, quitarlo"}
            </button>
            <button
              type="button"
              className="grande"
              onClick={() => {
                setTexto(propuesta.texto);
                cambiar();
              }}
              disabled={pendiente}
              data-patty="apartar-ia-cambiar"
            >
              Cambiar algo
            </button>
          </div>
          {conDudas && <p className="suave apartar-ia-nota">Contéstame la duda (o toca «Cambiar algo») antes de apartarlo.</p>}
        </div>
      )}
      {error && (
        <p className="apartar-ia-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Microfono() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
    </svg>
  );
}

function Cuadro() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}
