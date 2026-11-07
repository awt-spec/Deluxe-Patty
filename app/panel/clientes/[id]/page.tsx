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
import { cambiarEtapa, guardarBusca, guardarCierre, guardarNotas, guardarOportunidad, guardarSeguimiento, unirCliente } from "../acciones";
import { ZONAS_CONOCIDAS } from "@/lib/agenda/zonas";
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
      .select("id, nombre, telefono, email, origen, notas, etapa, etapa_at, busca, seguimiento_fecha, seguimiento_nota, motivo_perdida, created_at, propiedad_interes_id, oferta_monto, cierre_propiedad_id, cierre_precio, cierre_comision, cierre_at")
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
  // Otros clientes, para unir si son la misma persona; los que parecen la misma (mismo nombre o correo)
  // se avisan arriba.
  const { data: otrosData } = await supabase
    .from("contactos")
    .select("id, nombre, telefono, email")
    .eq("corredor_id", corredor.id)
    .eq("es_corredor", false)
    .neq("id", id)
    .order("nombre")
    .limit(500);
  const otros = (otrosData ?? []) as { id: string; nombre: string | null; telefono: string; email: string | null }[];
  const norm = (t: string | null) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const parecidos = otros.filter(
    (o) => (c.nombre && norm(o.nombre) === norm(c.nombre as string)) || (c.email && o.email && norm(o.email) === norm(c.email as string)),
  );
  const nombre = (c.nombre as string | null) ?? telefonoBonito(c.telefono as string);
  const manana = fechaIso(sumarDias(fechaLocal(new Date(), zona), 1));
  const resumen = resumenBusca(busca);

  const diasEnEtapa = Math.max(0, Math.floor((Date.now() - Date.parse(c.etapa_at as string)) / 86_400_000));
  const venceRecordatorio = !!c.seguimiento_fecha && (c.seguimiento_fecha as string) <= fechaIso(fechaLocal(new Date(), zona));
  const valorEnJuego = Number(c.oferta_monto ?? 0) || casaInteres?.precio || 0;
  const visitas = (citas ?? []) as { id: string; inicio: string; estado: string; propiedades: { titulo: string } | { titulo: string }[] | null }[];

  return (
    <>
      <Volver href="/panel/clientes" texto="Clientes" />
      <Aviso texto={aviso} />

      {/* Cabecera: quién es, en qué va y lo más importante de un vistazo */}
      <section className={`ficha-cabecera etapa-${etapa}`}>
        <div className="ficha-identidad">
          <Avatar nombre={c.nombre as string | null} telefono={c.telefono as string} grande />
          <div className="ficha-nombre">
            <h1>{nombre}</h1>
            <p className="suave">
              {c.nombre ? `${telefonoBonito(c.telefono as string)} · ` : ""}llegó por {ORIGEN[c.origen as string] ?? c.origen}
            </p>
          </div>
          <div className="ficha-etapa">
            <span className={`etapa etapa-${etapa}`}>{NOMBRE_ETAPA[etapa]}</span>
            <span className="suave">{diasEnEtapa === 0 ? "desde hoy" : `hace ${diasEnEtapa} ${diasEnEtapa === 1 ? "día" : "días"}`}</span>
          </div>
        </div>
        <div className="ficha-datos">
          <div>
            <span className="ficha-dato-titulo">Busca</span>
            <span>{resumen || "Todavía no lo dijo"}</span>
          </div>
          <div>
            <span className="ficha-dato-titulo">{etapa === "cerrado" ? "Cerró en" : c.oferta_monto ? "Ofreció" : "En juego"}</span>
            <span>
              {etapa === "cerrado" && c.cierre_precio
                ? precio(Number(c.cierre_precio), "USD")
                : valorEnJuego
                  ? `${precio(valorEnJuego, "USD")} · comisión ${precio(Math.round((valorEnJuego * pct) / 100), "USD")}`
                  : "Sin casa elegida"}
            </span>
          </div>
          <div className={venceRecordatorio ? "vence" : undefined}>
            <span className="ficha-dato-titulo">Recordatorio</span>
            <span>
              {c.seguimiento_fecha
                ? `${venceRecordatorio ? "Hoy" : etiquetaHorario(new Date(`${c.seguimiento_fecha as string}T12:00:00`), zona).split(",")[0]}: ${(c.seguimiento_nota as string | null) ?? "escribirle"}`
                : "Ninguno"}
            </span>
          </div>
        </div>
        <div className="cliente-acciones">
          {conv && (
            <Link href={`/panel/conversaciones/${conv.id}`} className="boton primario">
              <IconoChats tamano={20} /> Ver el chat
            </Link>
          )}
          <a href={`https://wa.me/${(c.telefono as string).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="boton">
            <IconoChats tamano={20} /> WhatsApp
          </a>
          <Link data-patty="cliente-agendar" href={`/panel/agenda/nueva?cliente=${id}`} className="boton">
            <IconoAgenda tamano={20} /> Agendar visita
          </Link>
          <a href={`tel:${c.telefono as string}`} className="boton">
            <IconoTelefono tamano={20} /> Llamar
          </a>
        </div>
        <div className="preguntas-patty">
          <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Qué le digo a este cliente?" />
          <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Qué casa le ofrezco?" />
        </div>
      </section>

      {parecidos.length > 0 && (
        <form action={unirCliente} className="aviso parecido">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="otro" value={parecidos[0].id} />
          <span>
            Parece la misma persona que <strong>{parecidos[0].nombre ?? telefonoBonito(parecidos[0].telefono)}</strong> (
            {telefonoBonito(parecidos[0].telefono)}).
          </span>
          <button type="submit">Unirlos</button>
        </form>
      )}

      <h2 data-patty="cliente-etapa" className="ficha-subtitulo">
        ¿En qué va?
      </h2>
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

      <div className="ficha-grid">
        {/* Columna principal: lo que pasó con el cliente y lo que viene */}
        <div className="ficha-principal">
          <Historia supabase={supabase} corredorId={corredor.id} contactoId={id} zona={zona} nombreAsistente={corredor.nombre_asistente ?? "Patty"} />

          {visitas.length > 0 && (
            <section className="tarjeta pila">
              <h2>Visitas</h2>
              <ul className="ficha-visitas">
                {visitas.map((v) => {
                  const casa = (Array.isArray(v.propiedades) ? v.propiedades[0] : v.propiedades) as { titulo: string } | null;
                  return (
                    <li key={v.id}>
                      <Link href={`/panel/agenda/visita/${v.id}`}>
                        <span>
                          <strong>{etiquetaHorario(new Date(v.inicio), zona)}</strong>
                          {casa && <span className="suave"> · {casa.titulo}</span>}
                        </span>
                        <span className="insignia">{ESTADO_CITA[v.estado] ?? v.estado}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {casas.length > 0 && (
            <section className="tarjeta pila">
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
            </section>
          )}
        </div>

        {/* Columna lateral: los datos que se editan */}
        <aside className="ficha-lateral">
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
                <label htmlFor="cierre-precio">Precio final (dólares)</label>
                <input id="cierre-precio" name="precio" type="text" inputMode="numeric" required defaultValue={c.oferta_monto ?? casaInteres?.precio ?? ""} />
                <label htmlFor="cierre-comision">Tu comisión (vacía: {pct}%)</label>
                <input id="cierre-comision" name="comision" type="text" inputMode="numeric" placeholder={`${pct}% del precio`} />
                <button type="submit" className="primario">
                  Guardar el cierre
                </button>
              </form>
            ) : (
              <form action={guardarOportunidad} className="pila">
                <h2>Lo que está en juego</h2>
                <input type="hidden" name="id" value={id} />
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
                <label htmlFor="op-oferta">Oferta del cliente (dólares)</label>
                <input id="op-oferta" name="oferta" type="text" inputMode="numeric" defaultValue={c.oferta_monto ?? ""} placeholder="Si hizo una" />
                {valorEnJuego > 0 && (
                  <p className="comision-estimada">
                    Tu comisión: <strong>{precio(Math.round((valorEnJuego * pct) / 100), "USD")}</strong> <span className="suave">({pct}%)</span>
                  </p>
                )}
                <button type="submit" className="primario chico">
                  Guardar
                </button>
              </form>
            )}
          </section>

          <section className={`tarjeta pila${venceRecordatorio ? " recordatorio-vence" : ""}`}>
            <h2 data-patty="cliente-recordatorio">Recordatorio</h2>
            <form action={guardarSeguimiento} className="pila">
              <input type="hidden" name="id" value={id} />
              <input
                data-patty="cliente-recordatorio-texto"
                id="nota"
                name="nota"
                type="text"
                aria-label="Qué tienes que hacer"
                defaultValue={(c.seguimiento_nota as string | null) ?? ""}
                placeholder="¿Qué tienes que hacer? Ej.: llamarla"
              />
              <div className="botones atajos">
                <button type="submit" name="dias" value="1">Mañana</button>
                <button type="submit" name="dias" value="3">En 3 días</button>
                <button type="submit" name="dias" value="7">En 1 semana</button>
              </div>
              <details>
                <summary>Otro día</summary>
                <div className="fila campos">
                  <input id="fecha" name="fecha" type="date" aria-label="Día" defaultValue={(c.seguimiento_fecha as string | null) ?? manana} />
                  <button type="submit" className="primario chico">
                    Guardar
                  </button>
                </div>
              </details>
              {c.seguimiento_fecha && (
                <button type="submit" name="quitar" value="1" className="chico ya-lo-hice">
                  Ya lo hice
                </button>
              )}
            </form>
          </section>

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
                <input id="zonas" name="zonas" type="text" list="zonas-conocidas" defaultValue={(busca.zonas ?? []).join(", ")} placeholder="Escazú, Santa Ana" />
                <datalist id="zonas-conocidas">
                  {ZONAS_CONOCIDAS.map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
                <div className="fila campos">
                  <div className="pila" style={{ flex: 2 }}>
                    <label htmlFor="presupuesto">Presupuesto máximo</label>
                    <input id="presupuesto" name="presupuesto" type="text" inputMode="numeric" defaultValue={busca.presupuesto_max ?? ""} />
                  </div>
                  <div className="pila" style={{ flex: 1 }}>
                    <label htmlFor="moneda">Moneda</label>
                    <select id="moneda" name="moneda" defaultValue={busca.moneda ?? "USD"}>
                      <option value="USD">Dólares</option>
                      <option value="CRC">Colones</option>
                    </select>
                  </div>
                </div>
                <label htmlFor="habitaciones">Cuartos</label>
                <input id="habitaciones" name="habitaciones" type="number" min={0} defaultValue={busca.habitaciones ?? ""} />
                <button type="submit" className="primario chico">
                  Guardar
                </button>
              </form>
            </details>
          </section>

          <section className="tarjeta pila">
            <h2 data-patty="cliente-notas">Notas</h2>
            <p className={c.notas ? "ficha-notas" : "suave"}>{(c.notas as string | null) ?? "Sin notas todavía."}</p>
            <details>
              <summary>{c.notas ? "Editar" : "Escribir notas"}</summary>
              <form action={guardarNotas} className="pila">
                <input type="hidden" name="id" value={id} />
                <label htmlFor="nombre">Nombre</label>
                <input id="nombre" name="nombre" type="text" defaultValue={(c.nombre as string | null) ?? ""} />
                <label htmlFor="notas">Lo que quieras recordar</label>
                <textarea id="notas" name="notas" defaultValue={(c.notas as string | null) ?? ""} placeholder="Tiene dos hijos, busca colegio cerca, viene de Estados Unidos…" />
                <button type="submit" className="primario chico">
                  Guardar
                </button>
              </form>
            </details>
          </section>

          <details className="tarjeta pila unir">
            <summary>¿Es la misma persona que otro cliente?</summary>
            <form action={unirCliente} className="pila">
              <input type="hidden" name="id" value={id} />
              <label htmlFor="otro">Unir con</label>
              <select id="otro" name="otro" required defaultValue="">
                <option value="" disabled>
                  Elige el otro cliente
                </option>
                {otros.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre ?? telefonoBonito(o.telefono)} · {telefonoBonito(o.telefono)}
                  </option>
                ))}
              </select>
              <p className="suave">Sus chats, visitas e historia pasan a este cliente y se completan los datos que falten. Su teléfono queda en las notas.</p>
              <button type="submit" className="chico">
                Unir
              </button>
            </form>
          </details>
        </aside>
      </div>
    </>
  );
}
