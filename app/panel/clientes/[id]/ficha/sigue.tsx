import Link from "next/link";
import { IconoAgenda, IconoChats, IconoTelefono } from "../../../iconos";
import type { AccionQueSigue, QueSigue } from "../que-sigue";

const ICONO = { whatsapp: IconoChats, llamar: IconoTelefono, agenda: IconoAgenda } as const;

function BotonAccion({ a, primaria }: { a: AccionQueSigue; primaria?: boolean }) {
  const Icono = a.tipo === "ficha" ? null : ICONO[a.tipo];
  const clase = `boton${primaria ? " primario" : ""}`;
  const cuerpo = (
    <>
      {Icono && <Icono tamano={20} />}
      {a.texto}
    </>
  );
  if (a.href.startsWith("/"))
    return (
      <Link href={a.href} className={clase}>
        {cuerpo}
      </Link>
    );
  return (
    <a href={a.href} className={clase} {...(a.externo ? { target: "_blank", rel: "noreferrer" } : {})}>
      {cuerpo}
    </a>
  );
}

/** Qué sigue: una sola recomendación, armada por código (que-sigue.ts). */
export function SeccionQueSigue({ sigue }: { sigue: QueSigue }) {
  return (
    <section className={`fc-sigue${sigue.urgente ? " urgente" : ""} fc-sigue-${sigue.motivo}`} aria-labelledby="fc-sigue-titulo">
      <p className="fc-sigue-etiqueta">Qué sigue</p>
      <h2 id="fc-sigue-titulo">{sigue.titulo}</h2>
      {sigue.detalle && <p className="fc-sigue-detalle">{sigue.detalle}</p>}
      <div className="fc-sigue-botones">
        <BotonAccion a={sigue.accion} primaria />
        {sigue.otra && <BotonAccion a={sigue.otra} />}
      </div>
    </section>
  );
}
