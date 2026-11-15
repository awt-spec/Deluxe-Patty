import Link from "next/link";
import { NOMBRE_ETAPA, telefonoBonito, type Etapa } from "@/lib/crm/perfil";
import { Avatar } from "../../../avatar";
import { IconoAgenda, IconoChats, IconoLapiz, IconoTelefono } from "../../../iconos";
import { PreguntarPatty } from "../../../preguntar-patty";
import { antiguedad, cuandoLlego, textoOrigen } from "./reglas";
import type { ClienteFicha } from "./tipos";

// Quién es, de dónde vino y las acciones de siempre (en el teléfono, en una barra abajo).

type Quien = Pick<ClienteFicha, "id" | "nombre" | "telefono" | "origen" | "etapa">;

export function Cabecera({
  c,
  nombre,
  conversacionId,
  llego,
  diasCliente,
  operacion,
  alquiler,
  anuncio,
  vinoDelSitio,
  asistente,
}: {
  c: Quien;
  nombre: string;
  conversacionId: string | null;
  llego: string;
  diasCliente: number;
  operacion: string | null;
  alquiler: boolean;
  anuncio: { titulo: string | null; referencia: string } | null;
  vinoDelSitio: boolean;
  asistente: string;
}) {
  return (
    <header className={`tarjeta fc-cabecera etapa-${c.etapa}`}>
      <div className="fc-identidad">
        <Avatar nombre={c.nombre} telefono={c.telefono} grande />
        <div className="fc-quien">
          <h1>{nombre}</h1>
          <Contacto nombre={c.nombre} telefono={c.telefono} conversacionId={conversacionId} />
          <p className="fc-origen">
            Llegó por {textoOrigen(c.origen)} {cuandoLlego(llego)}
            {antiguedad(diasCliente)}
          </p>
          <Chips etapa={c.etapa} operacion={operacion} alquiler={alquiler} anuncio={anuncio} vinoDelSitio={vinoDelSitio} />
        </div>
      </div>
      <BarraAcciones id={c.id} telefono={c.telefono} />
      <div className="preguntas-patty fc-preguntas">
        <PreguntarPatty nombre={asistente} pregunta="¿Qué le digo a este cliente?" />
        <PreguntarPatty nombre={asistente} pregunta="¿Qué casa le ofrezco?" />
      </div>
    </header>
  );
}

/** El teléfono (si ya tiene nombre: si no, el teléfono es el título) y el enlace al chat. */
function Contacto({ nombre, telefono, conversacionId }: { nombre: string | null; telefono: string; conversacionId: string | null }) {
  if (!nombre && !conversacionId) return null;
  return (
    <p className="fc-telefono">
      {nombre && <a href={`tel:${telefono}`}>{telefonoBonito(telefono)}</a>}
      {conversacionId && (
        <Link href={`/panel/conversaciones/${conversacionId}`} className="fc-ver-chat">
          <IconoChats tamano={16} />
          Ver el chat
        </Link>
      )}
    </p>
  );
}

function Chips({
  etapa,
  operacion,
  alquiler,
  anuncio,
  vinoDelSitio,
}: {
  etapa: Etapa;
  operacion: string | null;
  alquiler: boolean;
  anuncio: { titulo: string | null; referencia: string } | null;
  vinoDelSitio: boolean;
}) {
  return (
    <div className="fc-chips">
      <span className={`etapa etapa-${etapa}`}>{NOMBRE_ETAPA[etapa]}</span>
      {operacion && <span className="fc-chip">{alquiler ? "Alquiler" : "Compra"}</span>}
      {anuncio && (
        <Link href="/panel/anuncios" className="fc-chip fc-chip-enlace">
          Anuncio: {anuncio.titulo ?? anuncio.referencia}
        </Link>
      )}
      {vinoDelSitio && <span className="fc-chip">Vino de tu sitio web</span>}
    </div>
  );
}

/** WhatsApp, llamar, agendar y anotar. En el teléfono va abajo y se esconde al bajar (OcultarAlBajar). */
export function BarraAcciones({ id, telefono }: { id: string; telefono: string }) {
  return (
    <nav className="fc-acciones" aria-label="Acciones con el cliente">
      <a href={`https://wa.me/${telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="fc-accion fc-accion-wa">
        <IconoChats tamano={22} />
        <span>WhatsApp</span>
      </a>
      <a href={`tel:${telefono}`} className="fc-accion">
        <IconoTelefono tamano={22} />
        <span>Llamar</span>
      </a>
      <Link data-patty="cliente-agendar" href={`/panel/agenda/nueva?cliente=${id}`} className="fc-accion">
        <IconoAgenda tamano={22} />
        <span>
          Agendar<span className="fc-solo-ancho"> visita</span>
        </span>
      </Link>
      <a href="#anotar" className="fc-accion">
        <IconoLapiz tamano={22} />
        <span>Anotar</span>
      </a>
    </nav>
  );
}
