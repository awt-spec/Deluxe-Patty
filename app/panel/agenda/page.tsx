import { headers } from "next/headers";
import Link from "next/link";
import { diaLargo, horaCorta } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal } from "@/lib/agenda/tiempo";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { Aviso } from "../aviso";
import { cambiarEnlaceCalendario } from "./acciones";

type Cita = {
  id: string;
  inicio: string;
  estado: string;
  contactos: { nombre: string | null; telefono: string } | { nombre: string | null; telefono: string }[] | null;
  propiedades: { titulo: string } | { titulo: string }[] | null;
};

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function Agenda({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const desde = new Date();
  desde.setHours(desde.getHours() - 2);
  const { data } = await supabase
    .from("citas")
    .select("id, inicio, estado, contactos(nombre, telefono), propiedades(titulo)")
    .in("estado", ["agendada", "confirmada"])
    .gte("inicio", desde.toISOString())
    .order("inicio")
    .limit(100);
  const citas = (data ?? []) as Cita[];

  // El token del calendario no es legible con la sesión del corredor (RLS por columnas): se lee con el
  // backend solo para el corredor que ya se verificó con su sesión.
  const { data: fila } = await createAdminClient()
    .from("corredores")
    .select("token_calendario")
    .eq("id", corredor.id)
    .single();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocolo = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const enlace = fila && host ? `${host}/api/calendario/${fila.token_calendario}.ics` : null;

  const porDia = new Map<string, Cita[]>();
  for (const c of citas) {
    const dia = fechaIso(fechaLocal(new Date(c.inicio), zona));
    porDia.set(dia, [...(porDia.get(dia) ?? []), c]);
  }

  return (
    <>
      <header className="encabezado">
        <h1>Agenda</h1>
        <Link href="/panel/agenda/horario" className="boton">
          Mi horario
        </Link>
      </header>
      <Aviso texto={aviso} />
      {citas.length === 0 && <p className="vacio">No tienes visitas agendadas. Cuando la asistente agende una, aparece aquí.</p>}
      {[...porDia.entries()].map(([dia, lista]) => (
        <section key={dia}>
          <h2>{diaLargo(new Date(lista[0].inicio), zona)}</h2>
          {lista.map((c) => {
            const contacto = uno(c.contactos);
            const propiedad = uno(c.propiedades);
            return (
              <div key={c.id} className="tarjeta acento fila">
                <div>
                  <strong>{horaCorta(new Date(c.inicio), zona)}</strong> · {contacto?.nombre ?? contacto?.telefono}
                  {propiedad && <p className="suave">{propiedad.titulo}</p>}
                </div>
                <span className={`insignia ${c.estado === "confirmada" ? "dorada" : ""}`}>
                  {c.estado === "confirmada" ? "Confirmada" : "Por confirmar"}
                </span>
              </div>
            );
          })}
        </section>
      ))}

      {enlace && (
        <details className="tarjeta pila" style={{ marginTop: 20 }}>
          <summary>Ver las visitas en el calendario de tu teléfono</summary>
          <p className="suave">
            Suscríbete una vez y las visitas aparecen solas en el calendario de tu teléfono. El enlace es privado: no lo
            compartas.
          </p>
          <a href={`webcal://${enlace}`} className="boton primario">
            Suscribirme desde el iPhone
          </a>
          <p className="suave">En Google Calendar: “Otros calendarios” → “Desde URL” y pega este enlace:</p>
          <input type="text" readOnly value={`${protocolo}://${enlace}`} aria-label="Enlace del calendario" />
          <form action={cambiarEnlaceCalendario}>
            <p className="suave">¿Lo compartiste sin querer? Cámbialo y el anterior deja de funcionar.</p>
            <button type="submit" className="chico">
              Cambiar el enlace
            </button>
          </form>
        </details>
      )}
    </>
  );
}
