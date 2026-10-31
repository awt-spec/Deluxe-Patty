import { Volver } from "../volver";
import Link from "next/link";
import { diaLargo, horaCorta } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, limitesDia, sumarDias } from "@/lib/agenda/tiempo";
import { crearRepositorioSupabase } from "@/lib/datos/repositorio";
import { fechaCorta } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";

export default async function Resumen() {
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const ahora = new Date();
  // Con la sesión del corredor: RLS limita todo a sus datos.
  const repo = crearRepositorioSupabase(supabase);
  const hoy = fechaLocal(ahora, zona);
  const [datos, leads, porVencer] = await Promise.all([
    repo.datosPlan(corredor.id, ahora, limitesDia(ahora, zona), limitesDia(ahora, zona, 1)),
    supabase
      .from("leads_duenos")
      .select("id", { count: "exact", head: true })
      .eq("estado_contacto", "nuevo")
      .eq("es_dueno", true),
    supabase
      .from("anuncios_e24")
      .select("id, titulo, vence_en")
      .eq("estado", "activo")
      .gte("vence_en", fechaIso(hoy))
      .lte("vence_en", fechaIso(sumarDias(hoy, 7)))
      .order("vence_en"),
  ]);

  return (
    <>
      <Volver href="/panel/mas" texto="Más" />
      <header className="encabezado">
        <div>
          <p className="etiqueta">{diaLargo(ahora, zona)}</p>
          <h1>Hola, {corredor.nombre_contacto}</h1>
        </div>
      </header>


      {!corredor.respuesta_automatica && (
        <p className="aviso">
          Piloto en sombra: la asistente prepara cada respuesta y tú la apruebas antes de que salga.
        </p>
      )}

      <div className="cifras">
        <Link href="/panel" className="cifra">
          <strong>{datos.borradoresPendientes}</strong>
          <span className="suave">Por aprobar</span>
        </Link>
        <Link href="/panel" className="cifra">
          <strong>{datos.conversacionesEscaladas.length}</strong>
          <span className="suave">Te esperan</span>
        </Link>
        <Link href="/panel/duenos" className="cifra">
          <strong>{leads.count ?? 0}</strong>
          <span className="suave">Dueños nuevos</span>
        </Link>
      </div>

      <h2>Visitas de hoy</h2>
      {datos.citasHoy.length === 0 ? (
        <p className="suave">Hoy no tienes visitas agendadas.</p>
      ) : (
        datos.citasHoy.map((c, i) => (
          <div key={i} className="tarjeta acento fila">
            <div>
              <strong>{horaCorta(c.inicio, zona)}</strong> · {c.cliente}
              {c.propiedad && <p className="suave">{c.propiedad}</p>}
            </div>
            <span className={`insignia ${c.estado === "confirmada" ? "dorada" : ""}`}>
              {c.estado === "confirmada" ? "Confirmada" : "Por confirmar"}
            </span>
          </div>
        ))
      )}
      {datos.citasManana > 0 && (
        <p className="suave">
          Mañana: {datos.citasManana} {datos.citasManana === 1 ? "visita" : "visitas"}.
        </p>
      )}

      <h2>Prospectos nuevos</h2>
      {datos.prospectosNuevos.length === 0 ? (
        <p className="suave">Ninguno en las últimas 24 horas.</p>
      ) : (
        <p>{datos.prospectosNuevos.join(", ")}</p>
      )}

      {(porVencer.data ?? []).length > 0 && (
        <>
          <h2>Anuncios por vencer</h2>
          {(porVencer.data ?? []).map((a) => (
            <div key={a.id as string} className="tarjeta fila">
              <span>{(a.titulo as string | null) ?? "Anuncio"}</span>
              <span className="insignia alerta">vence el {fechaCorta(a.vence_en as string)}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
