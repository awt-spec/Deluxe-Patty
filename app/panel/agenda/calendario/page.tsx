import { headers } from "next/headers";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarEnlaceCalendario } from "../acciones";
import { EncabezadoPagina } from "../../piezas";
import { GuiaCalendario } from "./guia";
import "../../pasos/pasos.css";

// Ver las visitas en el calendario del teléfono, paso a paso (el enlace ICS de siempre).
export default async function Calendario() {
  const { supabase, corredor } = await sesionConCorredor();
  // El token del calendario no es legible con la sesión del corredor (RLS por columnas): se lee con el backend solo
  // para el corredor que ya se verificó con su sesión (igual que en la Agenda).
  const [{ data: fila }, { data: google }] = await Promise.all([
    createAdminClient().from("corredores").select("token_calendario").eq("id", corredor.id).single(),
    supabase.from("google_conexiones").select("correo").eq("corredor_id", corredor.id).maybeSingle(),
  ]);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocolo = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const enlace = fila && host ? `${host}/api/calendario/${fila.token_calendario}.ics` : null;

  return (
    <div className="pasos-pagina">
      <EncabezadoPagina
        titulo="Tus visitas en el calendario del teléfono"
        apoyo="Se hace una sola vez: después cada visita aparece sola en tu calendario."
        atras={{ href: "/panel/agenda", texto: "Agenda" }}
      />
      {enlace ? (
        <>
          <GuiaCalendario enlace={enlace} https={`${protocolo}://${enlace}`} google={(google?.correo as string | undefined) ?? null} />
          <form action={cambiarEnlaceCalendario} className="pap-nota" style={{ marginTop: 24 }}>
            <p style={{ margin: "0 0 8px" }}>¿Compartiste el enlace sin querer? Cámbialo: el anterior deja de funcionar y hay que volver a agregarlo.</p>
            <button type="submit" className="chico">
              Cambiar el enlace
            </button>
          </form>
        </>
      ) : (
        <p className="pap-nota">No pude armar el enlace del calendario ahora. Vuelve a intentarlo en un rato.</p>
      )}
    </div>
  );
}
