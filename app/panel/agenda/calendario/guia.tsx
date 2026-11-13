"use client";

import { useState, useSyncExternalStore } from "react";
import { detectarEntorno } from "@/lib/panel/extension-instalar";
import { AsistentePasos, BotonCopiar, usePasos, type PasoGuia } from "../../pasos/asistente-pasos";
import { IlusCalendarioVisitas, IlusSuscribirAndroid, IlusSuscribirIphone } from "../../pasos/ilustraciones";

// Ver las visitas en el calendario del teléfono con el enlace ICS (/api/calendario/<token>.ics): elegir el aparato
// (se adivina por el navegador), suscribirse y listo. El servidor no anota quién se suscribió, así que esta guía no
// avanza sola: la persona dice "ya lo hice".

type Aparato = "iphone" | "android" | "computadora";

const NOMBRES: Record<Aparato, { nombre: string; detalle: string }> = {
  iphone: { nombre: "iPhone", detalle: "Calendario de Apple" },
  android: { nombre: "Android", detalle: "Google Calendar" },
  computadora: { nombre: "Computadora", detalle: "Google Calendar u Outlook" },
};

const sinCambios = () => () => {};

function adivinar(): Aparato {
  const ua = navigator.userAgent;
  const e = detectarEntorno(ua, { toques: navigator.maxTouchPoints });
  if (/iPhone|iPad|iPod/.test(ua) || (e.sistema === "mac" && e.movil)) return "iphone";
  if (/Android/.test(ua)) return "android";
  return "computadora";
}

function ElegirAparato({ aparato, elegir }: { aparato: Aparato; elegir: (a: Aparato) => void }) {
  const { siguiente } = usePasos();
  return (
    <div className="pap-opciones" role="group" aria-label="Tu teléfono">
      {(Object.keys(NOMBRES) as Aparato[]).map((a) => (
        <button
          key={a}
          type="button"
          aria-pressed={aparato === a}
          onClick={() => {
            elegir(a);
            siguiente();
          }}
          data-patty={`calendario-${a}`}
        >
          {NOMBRES[a].nombre}
          <small>{NOMBRES[a].detalle}</small>
        </button>
      ))}
    </div>
  );
}

export function GuiaCalendario({ enlace, https, google }: { enlace: string; https: string; google: string | null }) {
  // El aparato se adivina en el navegador (en el servidor no se sabe); lo que la persona toque manda.
  const detectado = useSyncExternalStore(sinCambios, adivinar, () => null);
  const [elegido, setAparato] = useState<Aparato | null>(null);
  const aparato: Aparato = elegido ?? detectado ?? "computadora";
  const adivinado = detectado !== null;
  const webcal = `webcal://${enlace}`;
  const enGoogle = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  const botonIphone = (
    <a href={webcal} className="boton primario pap-accion" data-patty="calendario-agregar">
      Agregar a mi calendario
    </a>
  );
  const botonGoogle = (
    <a href={enGoogle} target="_blank" rel="noreferrer" className="boton primario pap-accion" data-patty="calendario-agregar">
      Agregar a Google Calendar
    </a>
  );

  const pasos: PasoGuia[] = [
    {
      id: "aparato",
      nombre: "Tu teléfono",
      titulo: "¿Qué teléfono tienes?",
      contenido: (
        <>
          <p className="pap-instruccion">
            {adivinado ? (
              <>
                Parece que estás en <strong>{NOMBRES[aparato].nombre}</strong>. Si no, elige el tuyo.
              </>
            ) : (
              "Elige el tuyo."
            )}
          </p>
          <ElegirAparato aparato={aparato} elegir={setAparato} />
          {google && (
            <p className="pap-nota pap-nota-verde">
              Ya conectaste Google ({google}): tus visitas ya van a tu Google Calendar. Si ese calendario está en tu teléfono, no hace falta esto.
            </p>
          )}
        </>
      ),
    },
    {
      id: "agregar",
      nombre: "Agregar",
      titulo: aparato === "iphone" ? "Toca «Agregar a mi calendario»" : "Agrégalo a Google Calendar",
      ilustracion: aparato === "iphone" ? <IlusSuscribirIphone /> : <IlusSuscribirAndroid />,
      contenido:
        aparato === "iphone" ? (
          <>
            <p className="pap-instruccion">
              Ábrelo <strong>en el iPhone</strong>. Toca el botón verde y, cuando el teléfono pregunte, toca <strong>Suscribirse</strong> y luego{" "}
              <strong>OK</strong>.
            </p>
            {botonIphone}
          </>
        ) : aparato === "android" ? (
          <>
            <p className="pap-instruccion">
              Toca el botón verde. Se abre Google Calendar con tu cuenta: toca <strong>Agregar</strong>.
            </p>
            {botonGoogle}
            <p className="pap-nota">Si te pide entrar, usa la misma cuenta de Google que tienes en el teléfono.</p>
          </>
        ) : (
          <>
            <p className="pap-instruccion">
              En la computadora, toca el botón verde y luego <strong>Agregar</strong>. Después aparece también en el teléfono si usas la misma cuenta de
              Google.
            </p>
            {botonGoogle}
            <p className="pap-instruccion">¿Usas Outlook u otro? Copia el enlace y pégalo donde diga «Suscribirse desde Internet» o «Desde URL».</p>
            <BotonCopiar texto={https} etiqueta="Copiar el enlace" patty="calendario-copiar" />
          </>
        ),
      ayuda: [
        {
          p: aparato === "iphone" ? "No pasa nada al tocarlo" : "Google dice que no encuentra el calendario",
          r:
            aparato === "iphone" ? (
              <>Ábrelo en Safari. Si sigue sin abrir: Ajustes del iPhone, Calendario, Cuentas, Agregar cuenta, Otra, «Agregar calendario suscrito» y pega el enlace.</>
            ) : (
              <>
                En Google Calendar en la computadora: «Otros calendarios», «+», «Desde URL», y pega el enlace.{" "}
                <BotonCopiar texto={https} etiqueta="Copiar el enlace" />
              </>
            ),
        },
        { p: "¿Alguien más puede verlo?", r: <>Solo quien tenga el enlace. No lo compartas; si lo compartiste sin querer, cámbialo abajo.</> },
      ],
    },
    {
      id: "ver",
      nombre: "Revisar",
      titulo: "Abre tu calendario",
      ilustracion: <IlusCalendarioVisitas />,
      contenido: (
        <>
          <p className="pap-instruccion">
            Busca un calendario nuevo con tus visitas. Ahí salen solas, con la casa y la zona; las que se agenden después aparecen en un rato.
          </p>
          <p className="pap-nota">
            {aparato === "iphone"
              ? "El iPhone lo revisa cada tanto. Para que sea más seguido: Ajustes, Calendario, Cuentas, Obtener datos, cada 15 minutos."
              : "Google lo revisa cada pocas horas: una visita nueva puede tardar en aparecer. En el panel siempre está al momento."}
          </p>
        </>
      ),
    },
  ];

  return (
    <AsistentePasos
      id="calendario"
      etiqueta="Pasos para ver las visitas en el calendario del teléfono"
      pasos={pasos}
      final={{
        titulo: "Listo: tus visitas en tu calendario",
        contenido: <p>Cada visita que agende la asistente o que pongas tú aparece ahí. Si cancelas o mueves una en el panel, también cambia allá.</p>,
      }}
    />
  );
}
