import Link from "next/link";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { clavePasos } from "@/lib/panel/pasos";
import { comoLeHaIdo, revisadas } from "@/lib/panel/puesta";
import { guardarAjustes } from "../../acciones";
import { Aviso } from "../../aviso";
import { BotonEnviar } from "../../boton-enviar";
import { EncabezadoPagina } from "../../piezas";
import { AsistentePasos, type PasoGuia } from "../../pasos/asistente-pasos";
import { IlusEncender, IlusTemas } from "../../pasos/ilustraciones";

// "¿Lista para contestar sola?": antes de apagar el piloto en sombra (corredores.respuesta_automatica), cómo le ha
// ido en 30 días (cifras contadas por código), qué temas le siguen tocando al corredor y el interruptor, con la
// misma acción de Ajustes (guardarAjustes con solo=respuesta_automatica). El corredor puede cambiar esa columna
// (permiso por columna de la migración inicial); si ya está encendida, la guía abre en el final.

export default async function ContestarSola({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const asistente = corredor.nombre_asistente ?? "Patty";
  const r = await revisadas(supabase, corredor.id);
  const v = comoLeHaIdo(r, asistente);
  const encendida = corredor.respuesta_automatica === true;
  const temas = corredor.reglas_escalamiento ?? [];
  const pct = (n: number) => (v.total ? `${(n / v.total) * 100}%` : "0%");

  const interruptor = (encender: boolean, texto: string, clase: string) => (
    <form action={guardarAjustes} data-patty={encender ? "sola-encender" : "sola-apagar"}>
      <input type="hidden" name="solo" value="respuesta_automatica" />
      <input type="hidden" name="volver" value="/panel/empezar/sola" />
      {encender && <input type="hidden" name="respuesta_automatica" value="on" />}
      <BotonEnviar texto={texto} pendiente="Guardando…" className={clase} />
    </form>
  );

  const pasos: PasoGuia[] = [
    {
      id: "como",
      nombre: "Cómo le ha ido",
      titulo: "Cómo le ha ido",
      contenido: (
        <>
          <p className="pap-instruccion">Las respuestas que revisaste en los últimos 30 días:</p>
          <div className="pap-cifras" data-patty="sola-cifras">
            <div className="pap-cifra" data-tono="verde">
              <strong>{r.aprobadas}</strong>
              <span>aprobaste sin cambios</span>
            </div>
            <div className="pap-cifra">
              <strong>{r.corregidas}</strong>
              <span>corregiste antes de mandar</span>
            </div>
            <div className="pap-cifra">
              <strong>{r.descartadas}</strong>
              <span>no mandaste</span>
            </div>
          </div>
          {v.total > 0 && (
            <div className="pap-barra" aria-hidden>
              <i className="b-bien" style={{ width: pct(r.aprobadas) }} />
              <i className="b-corr" style={{ width: pct(r.corregidas) }} />
              <i className="b-desc" style={{ width: pct(r.descartadas) }} />
            </div>
          )}
          <p className={`pap-nota${v.tono === "lista" ? " pap-nota-verde" : v.tono === "todavia" ? " pap-nota-ambar" : ""}`} role="status">
            <strong>{v.titulo}.</strong> {v.detalle}
          </p>
          <div className="pap-acciones">
            <Link href="/panel/probar" className="boton" data-patty="sola-probar">
              Probarla yo
            </Link>
            {r.corregidas > 0 && (
              <Link href="/panel/cerebro?ver=errores" className="boton">
                Ver lo que corregí
              </Link>
            )}
          </div>
        </>
      ),
      ayuda: [
        {
          p: "¿De dónde salen estas cifras?",
          r: <>Se cuentan las respuestas propuestas que aprobaste tal cual, las que cambiaste y las que no mandaste en Revisar. Nada es estimado.</>,
        },
      ],
    },
    {
      id: "temas",
      nombre: "Lo que te pasa",
      titulo: "Esto te lo sigue pasando a ti",
      ilustracion: <IlusTemas asistente={asistente} corredor={corredor.nombre_contacto ?? ""} />,
      contenido: (
        <>
          <p className="pap-instruccion">Aunque conteste sola, cuando un cliente toque uno de estos temas no contesta: te avisa.</p>
          {temas.length ? (
            <ul className="pap-lista" data-patty="sola-temas">
              {temas.map((t) => (
                <li key={t}>
                  <span style={{ display: "flex", minHeight: 52, alignItems: "center", padding: "8px 14px" }}>{t}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pap-nota pap-nota-ambar">Todavía no tienes temas: todo lo contestaría ella. Elígelos antes de encenderla.</p>
          )}
          <Link href={temas.length ? "/panel/ajustes#reglas" : "/panel/empezar"} className="boton pap-accion" data-patty="sola-editar-temas">
            {temas.length ? "Cambiar mis temas" : "Elegir mis temas"}
          </Link>
          <p className="pap-nota">Audios, fotos y lo que no sepa también te llegan siempre.</p>
        </>
      ),
    },
    {
      id: "encender",
      nombre: "Enciéndela",
      titulo: `Enciende "${asistente} contesta sola"`,
      ilustracion: <IlusEncender asistente={asistente} />,
      siguiente: null,
      contenido: (
        <>
          <p className="pap-instruccion">
            Desde ahora contesta <strong>sin esperarte</strong>. Lo que esté en tus temas te lo sigue pasando, y ves cada conversación en Inicio.
          </p>
          {interruptor(true, "Que conteste sola", "primario pap-accion")}
          <p className="pap-nota">Para apagarla: en Ajustes, «La asistente contesta sola», o aquí mismo. Vuelve a dejarte cada respuesta para revisar.</p>
        </>
      ),
    },
  ];

  return (
    <div className="pasos-pagina">
      <EncabezadoPagina
        titulo="¿Lista para contestar sola?"
        apoyo={`Hoy ${encendida ? `${asistente} contesta sola` : `revisas cada respuesta de ${asistente} antes de que salga`}.`}
        atras={{ href: "/panel/ajustes", texto: "Ajustes" }}
      />
      <Aviso texto={aviso} />
      <AsistentePasos
        id="sola"
        etiqueta="Pasos para que conteste sola"
        pasos={pasos}
        cumplidos={encendida ? pasos.map((p) => p.id) : []}
        clave={clavePasos("sola", corredor.id)}
        final={{
          titulo: `${asistente} ya contesta sola`,
          ilustracion: <IlusEncender asistente={asistente} />,
          contenido: (
            <>
              <p>Sigue pasándote tus temas, audios y lo que no sepa. Si algo no te gusta, apágala y vuelve a revisar cada respuesta.</p>
              {encendida && interruptor(false, "Apagarla: revisar cada respuesta", "")}
            </>
          ),
        }}
      />
    </div>
  );
}
