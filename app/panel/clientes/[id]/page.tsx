import Link from "next/link";
import { notFound } from "next/navigation";
import { etiquetaHorario } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import { ETAPAS, NOMBRE_ETAPA, encaja, resumenBusca, type Busca, type Etapa } from "@/lib/crm/perfil";
import type { Foto } from "@/lib/datos/tipos";
import { precio } from "@/lib/formato";
import { ordenarFotos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { Avatar } from "../../avatar";
import { IconoCasa, IconoChats, IconoTelefono } from "../../iconos";
import { Volver } from "../../volver";
import { cambiarEtapa, guardarBusca, guardarNotas, guardarSeguimiento } from "../acciones";

type Casa = {
  id: string;
  titulo: string;
  operacion: string;
  tipo: string;
  precio: number | null;
  moneda: string;
  zona: string | null;
  canton: string | null;
  habitaciones: number | null;
  fotos: Foto[];
};

const ESTADO_CITA: Record<string, string> = {
  agendada: "Por confirmar",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  realizada: "Hecha",
  no_asistio: "No llegó",
};

const ORIGEN: Record<string, string> = {
  anuncio: "un anuncio de Encuentra24",
  referido: "un referido",
  busqueda: "la búsqueda de dueños",
  whatsapp: "WhatsApp",
  otro: "otro medio",
};

export default async function Cliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { id } = await params;
  const { aviso } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;

  const [{ data: c }, { data: conv }, { data: citas }, { data: casasData }] = await Promise.all([
    supabase
      .from("contactos")
      .select("id, nombre, telefono, origen, notas, etapa, etapa_at, busca, seguimiento_fecha, seguimiento_nota, created_at")
      .eq("corredor_id", corredor.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("conversaciones")
      .select("id")
      .eq("corredor_id", corredor.id)
      .eq("contacto_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("citas")
      .select("id, inicio, estado, propiedades(titulo)")
      .eq("corredor_id", corredor.id)
      .eq("contacto_id", id)
      .order("inicio", { ascending: false })
      .limit(10),
    supabase
      .from("propiedades")
      .select("id, titulo, operacion, tipo, precio, moneda, zona, canton, habitaciones, fotos")
      .eq("corredor_id", corredor.id)
      .eq("estado", "activa")
      .limit(200),
  ]);
  if (!c) notFound();
  const busca = (c.busca ?? {}) as Busca;
  const etapa = c.etapa as Etapa;
  const casas = ((casasData ?? []) as Casa[]).filter((p) => encaja(busca, p)).slice(0, 6);
  const nombre = (c.nombre as string | null) ?? (c.telefono as string);
  const manana = fechaIso(sumarDias(fechaLocal(new Date(), zona), 1));
  const resumen = resumenBusca(busca);

  return (
    <>
      <Volver href="/panel/clientes" texto="Clientes" />
      <header className="cliente-cabecera">
        <Avatar nombre={c.nombre as string | null} telefono={c.telefono as string} grande />
        <div>
          <h1>{nombre}</h1>
          <p className="suave">
            {c.telefono as string} · llegó por {ORIGEN[c.origen as string] ?? c.origen}
          </p>
        </div>
      </header>
      <Aviso texto={aviso} />

      <div className="cliente-acciones">
        {conv && (
          <Link href={`/panel/conversaciones/${conv.id}`} className="boton primario">
            <IconoChats tamano={22} /> Ver el chat
          </Link>
        )}
        <a href={`https://wa.me/${(c.telefono as string).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="boton">
          <IconoChats tamano={22} /> WhatsApp
        </a>
        <a href={`tel:${c.telefono as string}`} className="boton">
          <IconoTelefono tamano={22} /> Llamar
        </a>
      </div>

      <h2>Etapa</h2>
      <form action={cambiarEtapa} className="etapas-selector">
        <input type="hidden" name="id" value={id} />
        {ETAPAS.map((e) => (
          <button key={e} type="submit" name="etapa" value={e} aria-pressed={e === etapa} className={`etapa etapa-${e}`}>
            {NOMBRE_ETAPA[e]}
          </button>
        ))}
      </form>

      <div className="cliente-columnas">
        <section className="tarjeta pila">
          <h2>Qué busca</h2>
          <p>{resumen || "Todavía no lo dijo. La asistente lo anota sola cuando el cliente lo cuenta en el chat."}</p>
          <details>
            <summary>Cambiarlo</summary>
            <form action={guardarBusca} className="pila">
              <input type="hidden" name="id" value={id} />
              <label htmlFor="operacion">Para</label>
              <select id="operacion" name="operacion" defaultValue={busca.operacion ?? ""}>
                <option value="">Sin decir</option>
                <option value="venta">Comprar</option>
                <option value="alquiler">Alquilar</option>
              </select>
              <label htmlFor="tipo">Tipo</label>
              <input id="tipo" name="tipo" type="text" defaultValue={busca.tipo ?? ""} placeholder="casa, apartamento, lote…" />
              <label htmlFor="zonas">Zonas (separadas por coma)</label>
              <input id="zonas" name="zonas" type="text" defaultValue={(busca.zonas ?? []).join(", ")} placeholder="Escazú, Santa Ana" />
              <div className="fila campos">
                <div className="pila">
                  <label htmlFor="presupuesto">Presupuesto máximo</label>
                  <input id="presupuesto" name="presupuesto" type="text" inputMode="numeric" defaultValue={busca.presupuesto_max ?? ""} />
                </div>
                <div className="pila">
                  <label htmlFor="moneda">Moneda</label>
                  <select id="moneda" name="moneda" defaultValue={busca.moneda ?? "USD"}>
                    <option value="USD">Dólares</option>
                    <option value="CRC">Colones</option>
                  </select>
                </div>
              </div>
              <label htmlFor="habitaciones">Cuartos</label>
              <input id="habitaciones" name="habitaciones" type="number" min={0} defaultValue={busca.habitaciones ?? ""} />
              <button type="submit" className="primario">
                Guardar
              </button>
            </form>
          </details>
        </section>

        <section className="tarjeta pila">
          <h2>Seguimiento</h2>
          {c.seguimiento_fecha ? (
            <p>
              <strong>{etiquetaHorario(new Date(`${c.seguimiento_fecha as string}T12:00:00`), zona).split(",")[0]}</strong>
              {c.seguimiento_nota ? `: ${c.seguimiento_nota as string}` : ""}
            </p>
          ) : (
            <p className="suave">Sin seguimiento pendiente.</p>
          )}
          <form action={guardarSeguimiento} className="pila">
            <input type="hidden" name="id" value={id} />
            <label htmlFor="fecha">Recordarme el</label>
            <input id="fecha" name="fecha" type="date" defaultValue={(c.seguimiento_fecha as string | null) ?? manana} />
            <label htmlFor="nota">Para</label>
            <input id="nota" name="nota" type="text" defaultValue={(c.seguimiento_nota as string | null) ?? ""} placeholder="Llamarla para ver si le gustó la casa" />
            <div className="botones">
              <button type="submit" className="primario">
                Guardar
              </button>
              {c.seguimiento_fecha && (
                <button type="submit" name="quitar" value="1">
                  Ya lo hice
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      {casas.length > 0 && (
        <>
          <h2>Casas que le encajan</h2>
          <div className="carrusel">
            {casas.map((p) => {
              const foto = ordenarFotos(p.fotos ?? [])[0]?.url;
              return (
                <Link key={p.id} href={`/panel/propiedades/${p.id}`} className="casa-tarjeta">
                  {foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={foto} alt="" loading="lazy" />
                  ) : (
                    <span className="sin-foto" aria-hidden>
                      <IconoCasa tamano={40} />
                    </span>
                  )}
                  <span className="casa-tarjeta-texto">
                    <strong>{p.titulo}</strong>
                    {p.precio !== null && <span>{precio(p.precio, p.moneda)}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <h2>Visitas</h2>
      {(citas ?? []).length === 0 ? (
        <p className="suave">Todavía no tiene visitas.</p>
      ) : (
        (citas ?? []).map((v) => {
          const casa = (Array.isArray(v.propiedades) ? v.propiedades[0] : v.propiedades) as { titulo: string } | null;
          return (
            <div key={v.id as string} className="tarjeta fila">
              <span>
                <strong>{etiquetaHorario(new Date(v.inicio as string), zona)}</strong>
                {casa && <span className="suave"> · {casa.titulo}</span>}
              </span>
              <span className="insignia">{ESTADO_CITA[v.estado as string] ?? (v.estado as string)}</span>
            </div>
          );
        })
      )}

      <h2>Notas</h2>
      <form action={guardarNotas} className="tarjeta pila">
        <input type="hidden" name="id" value={id} />
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" name="nombre" type="text" defaultValue={(c.nombre as string | null) ?? ""} />
        <label htmlFor="notas">Lo que quieras recordar de este cliente</label>
        <textarea id="notas" name="notas" defaultValue={(c.notas as string | null) ?? ""} placeholder="Tiene dos hijos, busca colegio cerca, viene de Estados Unidos…" />
        <button type="submit" className="primario">
          Guardar
        </button>
      </form>
    </>
  );
}
