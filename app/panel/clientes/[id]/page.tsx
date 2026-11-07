import Link from "next/link";
import { notFound } from "next/navigation";
import { etiquetaHorario } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import { AYUDA_ETAPA, ETAPAS, MOTIVOS_PERDIDA, NOMBRE_ETAPA, encaja, resumenBusca, telefonoBonito, type Busca, type Etapa } from "@/lib/crm/perfil";
import type { Foto } from "@/lib/datos/tipos";
import { precio } from "@/lib/formato";
import { ordenarFotos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { PreguntarPatty } from "../../preguntar-patty";
import { Avatar } from "../../avatar";
import { IconoAgenda, IconoCasa, IconoChats, IconoTelefono } from "../../iconos";
import { Volver } from "../../volver";
import { cambiarEtapa, guardarBusca, guardarCierre, guardarNotas, guardarOportunidad, guardarSeguimiento } from "../acciones";
import { Historia } from "./historia";

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
  correo: "correo electrónico",
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
      .select("id, nombre, telefono, origen, notas, etapa, etapa_at, busca, seguimiento_fecha, seguimiento_nota, motivo_perdida, created_at, propiedad_interes_id, oferta_monto, cierre_propiedad_id, cierre_precio, cierre_comision, cierre_at")
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
  // Para la casa que le interesa y el cierre: todas las casas del corredor (también las vendidas).
  const { data: todasData } = await supabase
    .from("propiedades")
    .select("id, titulo, precio, moneda, estado")
    .eq("corredor_id", corredor.id)
    .order("titulo")
    .limit(300);
  const todas = (todasData ?? []) as { id: string; titulo: string; precio: number | null; moneda: string; estado: string }[];
  const casaInteres = todas.find((p) => p.id === c.propiedad_interes_id) ?? null;
  const casaCierre = todas.find((p) => p.id === c.cierre_propiedad_id) ?? null;
  const pct = corredor.comision_pct ?? 5;
  const nombre = (c.nombre as string | null) ?? telefonoBonito(c.telefono as string);
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
            {c.nombre ? `${telefonoBonito(c.telefono as string)} · ` : ""}llegó por {ORIGEN[c.origen as string] ?? c.origen}
          </p>
        </div>
      </header>
      <Aviso texto={aviso} />
      <div className="preguntas-patty">
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Qué le digo a este cliente?" />
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Qué casa le ofrezco?" />
      </div>

      <div className="cliente-acciones">
        {conv && (
          <Link href={`/panel/conversaciones/${conv.id}`} className="boton primario">
            <IconoChats tamano={22} /> Ver el chat
          </Link>
        )}
        <a href={`https://wa.me/${(c.telefono as string).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="boton">
          <IconoChats tamano={22} /> WhatsApp
        </a>
        <Link data-patty="cliente-agendar" href={`/panel/agenda/nueva?cliente=${id}`} className="boton">
          <IconoAgenda tamano={22} /> Agendar visita
        </Link>
        <a href={`tel:${c.telefono as string}`} className="boton">
          <IconoTelefono tamano={22} /> Llamar
        </a>
      </div>

      <h2 data-patty="cliente-etapa">¿En qué va?</h2>
      <form action={cambiarEtapa} className="etapas-selector">
        <input type="hidden" name="id" value={id} />
        {ETAPAS.map((e) => (
          <button key={e} type="submit" name="etapa" value={e} aria-pressed={e === etapa} className={`etapa etapa-${e}`}>
            <strong>{NOMBRE_ETAPA[e]}</strong>
            <small>{AYUDA_ETAPA[e]}</small>
          </button>
        ))}
      </form>
      {etapa === "perdido" && (
        <form action={cambiarEtapa} className="tarjeta pila motivo-perdida">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="etapa" value="perdido" />
          <p>
            <strong>¿Por qué se perdió?</strong>
            {c.motivo_perdida ? <span className="suave"> Ahora dice: {c.motivo_perdida as string}</span> : null}
          </p>
          <div className="botones-motivo">
            {MOTIVOS_PERDIDA.map((m) => (
              <button key={m} type="submit" name="motivo" value={m} aria-pressed={m === c.motivo_perdida}>
                {m}
              </button>
            ))}
          </div>
        </form>
      )}

      <section className="tarjeta pila oportunidad" data-patty="cliente-oportunidad">
        {etapa === "cerrado" && c.cierre_precio ? (
          <>
            <h2>Cerró</h2>
            <p className="cierre-resumen">
              {casaCierre ? <strong>{casaCierre.titulo}</strong> : "Sin casa anotada"} · {precio(Number(c.cierre_precio), "USD")}
              <span className="cierre-comision">Comisión {precio(Number(c.cierre_comision ?? 0), "USD")}</span>
              {c.cierre_at && <span className="suave"> · {etiquetaHorario(new Date(c.cierre_at as string), zona).split(",")[0]}</span>}
            </p>
          </>
        ) : etapa === "cerrado" ? (
          <form action={guardarCierre} className="pila">
            <h2>¡Cerró! Anota cómo fue</h2>
            <input type="hidden" name="id" value={id} />
            <label htmlFor="cierre-casa">Casa</label>
            <select id="cierre-casa" name="casa" defaultValue={casaInteres?.id ?? ""}>
              <option value="">Ninguna de mis casas</option>
              {todas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
            <div className="fila campos">
              <div className="pila" style={{ flex: 1 }}>
                <label htmlFor="cierre-precio">Precio final (dólares)</label>
                <input id="cierre-precio" name="precio" type="text" inputMode="numeric" required defaultValue={c.oferta_monto ?? casaInteres?.precio ?? ""} />
              </div>
              <div className="pila" style={{ flex: 1 }}>
                <label htmlFor="cierre-comision">Tu comisión (si la dejas vacía, {pct}%)</label>
                <input id="cierre-comision" name="comision" type="text" inputMode="numeric" placeholder={`${pct}% del precio`} />
              </div>
            </div>
            <button type="submit" className="primario">
              Guardar el cierre
            </button>
          </form>
        ) : (
          <form action={guardarOportunidad} className="pila">
            <h2>Lo que está en juego</h2>
            <input type="hidden" name="id" value={id} />
            <div className="fila campos">
              <div className="pila" style={{ flex: 2 }}>
                <label htmlFor="op-casa">Casa que le interesa</label>
                <select id="op-casa" name="casa" defaultValue={casaInteres?.id ?? ""}>
                  <option value="">Todavía ninguna</option>
                  {todas
                    .filter((p) => p.estado === "activa" || p.id === casaInteres?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.titulo}
                        {p.precio ? ` · ${precio(p.precio, p.moneda)}` : ""}
                      </option>
                    ))}
                </select>
              </div>
              <div className="pila" style={{ flex: 1 }}>
                <label htmlFor="op-oferta">Oferta del cliente (dólares)</label>
                <input id="op-oferta" name="oferta" type="text" inputMode="numeric" defaultValue={c.oferta_monto ?? ""} placeholder="Si hizo una" />
              </div>
            </div>
            {(c.oferta_monto || casaInteres?.precio) && (
              <p className="suave">
                Si cierra en {precio(Number(c.oferta_monto ?? casaInteres?.precio), "USD")}, tu comisión sería de unos{" "}
                <strong>{precio(Math.round((Number(c.oferta_monto ?? casaInteres?.precio) * pct) / 100), "USD")}</strong> ({pct}%).
              </p>
            )}
            <button type="submit" className="primario">
              Guardar
            </button>
          </form>
        )}
      </section>

      <div className="cliente-columnas">
        <section className="tarjeta pila">
          <h2 data-patty="cliente-busca">Qué busca</h2>
          <p>{resumen || "Todavía no lo dijo. La asistente lo anota sola cuando el cliente lo cuenta en el chat."}</p>
          <details>
            <summary>Corregirlo</summary>
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
          <h2 data-patty="cliente-recordatorio">Recordatorio</h2>
          {c.seguimiento_fecha ? (
            <p>
              <strong>{etiquetaHorario(new Date(`${c.seguimiento_fecha as string}T12:00:00`), zona).split(",")[0]}</strong>
              {c.seguimiento_nota ? `: ${c.seguimiento_nota as string}` : ""}
            </p>
          ) : (
            <p className="suave">Nada pendiente con este cliente.</p>
          )}
          <form action={guardarSeguimiento} className="pila">
            <input type="hidden" name="id" value={id} />
            <label htmlFor="nota">¿Qué tienes que hacer?</label>
            <input data-patty="cliente-recordatorio-texto" id="nota" name="nota" type="text" defaultValue={(c.seguimiento_nota as string | null) ?? ""} placeholder="Llamarla para ver si le gustó la casa" />
            <p className="suave">Recordármelo:</p>
            <div className="botones atajos">
              <button type="submit" name="dias" value="1">Mañana</button>
              <button type="submit" name="dias" value="3">En 3 días</button>
              <button type="submit" name="dias" value="7">En una semana</button>
            </div>
            <label htmlFor="fecha">U otro día</label>
            <input id="fecha" name="fecha" type="date" defaultValue={(c.seguimiento_fecha as string | null) ?? manana} />
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
            <Link key={v.id as string} href={`/panel/agenda/visita/${v.id as string}`} className="tarjeta fila">
              <span>
                <strong>{etiquetaHorario(new Date(v.inicio as string), zona)}</strong>
                {casa && <span className="suave"> · {casa.titulo}</span>}
              </span>
              <span className="insignia">{ESTADO_CITA[v.estado as string] ?? (v.estado as string)}</span>
            </Link>
          );
        })
      )}

      <Historia supabase={supabase} corredorId={corredor.id} contactoId={id} zona={zona} nombreAsistente={corredor.nombre_asistente ?? "Patty"} />

      <h2 data-patty="cliente-notas">Notas</h2>
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
