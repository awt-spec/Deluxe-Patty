import Link from "next/link";
import { diaLargo } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import { ZONAS_CONOCIDAS } from "@/lib/agenda/zonas";
import { comisionEstimada, monedaDe, montoExacto, plata, reglaComision } from "@/lib/crm/dinero";
import { AYUDA_ETAPA, ETAPAS, MOTIVOS_PERDIDA, NOMBRE_ETAPA, telefonoBonito, type Busca, type Etapa } from "@/lib/crm/perfil";
import type { Foto } from "@/lib/datos/tipos";
import { precio } from "@/lib/formato";
import { ordenarFotos } from "@/lib/panel/formularios";
import { Aviso } from "../../aviso";
import { Avatar } from "../../avatar";
import { IconoAgenda, IconoCampana, IconoCasa, IconoChats, IconoCheck, IconoEstrella, IconoLapiz, IconoReloj, IconoTelefono } from "../../iconos";
import { Cifra, Vacio } from "../../piezas";
import { PreguntarPatty } from "../../preguntar-patty";
import { Volver } from "../../volver";
import { cambiarEtapa, guardarBusca, guardarCierre, guardarNotas, guardarOportunidad, guardarSeguimiento, unirCliente } from "../acciones";
import { Historia, type EventoHistoria } from "./historia";
import { DIAS_QUIETO, diasDesde, queSigue, type AccionQueSigue, type VisitaFicha } from "./que-sigue";

// Ficha de un cliente, solo forma: la página lee los datos (con la sesión del corredor) y los pasa aquí.
// Arriba quién es y las acciones; luego "Qué sigue", cifras, el camino por etapas y la historia; al lado
// (en computadora) lo que se edita: recordatorio, lo que está en juego, qué busca, casas y notas.

export type CasaFicha = {
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
export type CasaCorta = { id: string; titulo: string; precio: number | null; moneda: string; estado: string; operacion: string; zona?: string | null; fotos?: Foto[] };
export type OtroCliente = { id: string; nombre: string | null; telefono: string; email: string | null };

export interface ClienteFicha {
  id: string;
  nombre: string | null;
  telefono: string;
  origen: string;
  notas: string | null;
  etapa: Etapa;
  etapa_at: string;
  busca: Busca;
  seguimiento_fecha: string | null;
  seguimiento_nota: string | null;
  motivo_perdida: string | null;
  created_at: string;
  oferta_monto: number | null;
  oferta_moneda: string | null;
  cierre_precio: number | null;
  cierre_comision: number | null;
  cierre_moneda: string | null;
  cierre_at: string | null;
}

export interface DatosFicha {
  c: ClienteFicha;
  aviso?: string;
  conversacionId: string | null;
  visitas: VisitaFicha[];
  casasEncajan: CasaFicha[];
  casaInteres: CasaCorta | null;
  casaCierre: CasaCorta | null;
  todas: CasaCorta[];
  otros: OtroCliente[];
  parecidos: OtroCliente[];
  eventos: EventoHistoria[];
  diasSinMovimiento: number;
  anuncio: { titulo: string | null; referencia: string } | null;
  vinoDelSitio: boolean;
  ahora: Date;
  zona: string;
  nombreAsistente: string;
  comisionPct: number;
}

const ORIGEN: Record<string, string> = {
  anuncio: "un anuncio de Encuentra24",
  referido: "un referido",
  busqueda: "la búsqueda de dueños",
  whatsapp: "WhatsApp",
  otro: "otro medio",
  correo: "correo electrónico",
};

/** Las etapas del camino, en orden; "Perdido" va aparte. */
const CAMINO = ETAPAS.filter((e) => e !== "perdido");

const hace = (n: number) => (n === 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`);

function BotonAccion({ a, primaria }: { a: AccionQueSigue; primaria?: boolean }) {
  const Icono = a.tipo === "whatsapp" ? IconoChats : a.tipo === "llamar" ? IconoTelefono : a.tipo === "agenda" ? IconoAgenda : null;
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

function FotoCasa({ fotos, tamano = 36 }: { fotos?: Foto[]; tamano?: number }) {
  const foto = ordenarFotos(fotos ?? [])[0]?.url;
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={foto} alt="" loading="lazy" />
  ) : (
    <span className="fc-sin-foto" aria-hidden>
      <IconoCasa tamano={tamano} />
    </span>
  );
}

export function FichaCliente(d: DatosFicha) {
  const { c, zona, ahora } = d;
  const id = c.id;
  const etapa = c.etapa;
  const busca = c.busca ?? {};
  const nombre = c.nombre ?? telefonoBonito(c.telefono);
  const hoy = fechaIso(fechaLocal(ahora, zona));
  const manana = fechaIso(sumarDias(fechaLocal(ahora, zona), 1));
  const activo = etapa !== "cerrado" && etapa !== "perdido";

  const diasEnEtapa = diasDesde(c.etapa_at, ahora);
  const diasCliente = diasDesde(c.created_at, ahora);
  const venceRecordatorio = !!c.seguimiento_fecha && c.seguimiento_fecha <= hoy;
  const casaInteres = d.casaInteres;
  // Lo que vale el negocio: la oferta en su moneda o, si no hay, el precio de la casa que le interesa.
  const valorEnJuego = Number(c.oferta_monto ?? 0) || casaInteres?.precio || 0;
  const monedaEnJuego = c.oferta_monto ? monedaDe(c.oferta_moneda) : monedaDe(casaInteres?.moneda);
  // Venta o alquiler: lo dice la casa; si no hay casa, lo que el cliente busca.
  const operacion = casaInteres?.operacion ?? busca.operacion ?? null;
  const alquiler = operacion === "alquiler";
  const comisionEnJuego = valorEnJuego ? comisionEstimada(valorEnJuego, d.comisionPct, operacion) : 0;
  const monedaCierre = monedaDe(c.cierre_moneda);
  const sabeQueBusca = !!(busca.operacion || busca.tipo || busca.zonas?.length || busca.presupuesto_max || busca.habitaciones);

  const hechas = d.visitas.filter((v) => v.estado === "realizada").length;
  const proximas = d.visitas.filter((v) => (v.estado === "agendada" || v.estado === "confirmada") && Date.parse(v.inicio) > ahora.getTime()).length;

  const sigue = queSigue({
    ahora,
    zona,
    etapa,
    telefono: c.telefono,
    seguimientoFecha: c.seguimiento_fecha,
    seguimientoNota: c.seguimiento_nota,
    visitas: d.visitas,
    ofertaMonto: c.oferta_monto ? Number(c.oferta_monto) : null,
    ofertaMoneda: c.oferta_moneda,
    diasSinMovimiento: d.diasSinMovimiento,
    sabeQueBusca,
    cierreAnotado: !!c.cierre_precio,
    motivoPerdida: c.motivo_perdida,
    casasQueEncajan: d.casasEncajan.filter((p) => p.id !== casaInteres?.id).length,
    tieneCasaInteres: !!casaInteres,
  });

  // La cifra de dinero: el cierre, la oferta, el presupuesto o la casa que le interesa (cada uno en su moneda).
  const dinero =
    etapa === "cerrado" && c.cierre_precio
      ? { monto: Number(c.cierre_precio), moneda: monedaCierre, que: "cerró en" }
      : c.oferta_monto
        ? { monto: Number(c.oferta_monto), moneda: monedaDe(c.oferta_moneda), que: alquiler ? "ofreció al mes" : "ofreció" }
        : busca.presupuesto_max
          ? { monto: Number(busca.presupuesto_max), moneda: monedaDe(busca.moneda), que: alquiler ? "presupuesto al mes" : "presupuesto" }
          : casaInteres?.precio
            ? { monto: Number(casaInteres.precio), moneda: monedaDe(casaInteres.moneda), que: "la casa que le interesa" }
            : null;

  const datosBusca = [
    busca.operacion ? { k: "Para", v: busca.operacion === "alquiler" ? "Alquilar" : "Comprar" } : null,
    busca.tipo ? { k: "Tipo", v: busca.tipo } : null,
    busca.zonas?.length ? { k: "Zonas", v: busca.zonas.join(", ") } : null,
    busca.presupuesto_max ? { k: "Hasta", v: `${montoExacto(Number(busca.presupuesto_max), monedaDe(busca.moneda))}${busca.operacion === "alquiler" ? " al mes" : ""}` } : null,
    busca.habitaciones ? { k: "Cuartos", v: String(busca.habitaciones) } : null,
  ].filter((x): x is { k: string; v: string } => !!x);

  // Primero la casa que le interesa (si es de las activas), luego las que le encajan.
  const casas = [
    ...(casaInteres && casaInteres.estado === "activa" ? [{ ...casaInteres, interes: true }] : []),
    ...d.casasEncajan.filter((p) => p.id !== casaInteres?.id).map((p) => ({ ...p, estado: "activa", interes: false })),
  ];
  const indiceEtapa = CAMINO.indexOf(etapa as (typeof CAMINO)[number]);
  const asistente = d.nombreAsistente;

  return (
    <div className="fc-ficha">
      <Volver href="/panel/clientes" texto="Clientes" />
      <Aviso texto={d.aviso} />

      {/* Quién es, de dónde vino y las acciones de siempre (en el teléfono, en una barra abajo) */}
      <header className={`tarjeta fc-cabecera etapa-${etapa}`}>
        <div className="fc-identidad">
          <Avatar nombre={c.nombre} telefono={c.telefono} grande />
          <div className="fc-quien">
            <h1>{nombre}</h1>
            <p className="fc-telefono">
              <a href={`tel:${c.telefono}`}>{telefonoBonito(c.telefono)}</a>
              {d.conversacionId && (
                <Link href={`/panel/conversaciones/${d.conversacionId}`} className="fc-ver-chat">
                  <IconoChats tamano={16} />
                  Ver el chat
                </Link>
              )}
            </p>
            <p className="fc-origen">
              Llegó por {ORIGEN[c.origen] ?? c.origen} el {diaLargo(new Date(c.created_at), zona)}
              {diasCliente > 1 ? ` (${hace(diasCliente)})` : ""}
            </p>
            <div className="fc-chips">
              <span className={`etapa etapa-${etapa}`}>{NOMBRE_ETAPA[etapa]}</span>
              {operacion && <span className="fc-chip">{alquiler ? "Alquiler" : "Compra"}</span>}
              {d.anuncio && (
                <Link href="/panel/anuncios" className="fc-chip fc-chip-enlace">
                  Anuncio: {d.anuncio.titulo ?? d.anuncio.referencia}
                </Link>
              )}
              {d.vinoDelSitio && <span className="fc-chip">Vino de tu sitio web</span>}
            </div>
          </div>
        </div>
        <nav className="fc-acciones" aria-label="Acciones con el cliente">
          <a href={`https://wa.me/${c.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="fc-accion fc-accion-wa">
            <IconoChats tamano={22} />
            <span>WhatsApp</span>
          </a>
          <a href={`tel:${c.telefono}`} className="fc-accion">
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
        <div className="preguntas-patty fc-preguntas">
          <PreguntarPatty nombre={asistente} pregunta="¿Qué le digo a este cliente?" />
          <PreguntarPatty nombre={asistente} pregunta="¿Qué casa le ofrezco?" />
        </div>
      </header>

      {d.parecidos.length > 0 && (
        <form action={unirCliente} className="aviso parecido">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="otro" value={d.parecidos[0].id} />
          <span>
            Parece la misma persona que <strong>{d.parecidos[0].nombre ?? telefonoBonito(d.parecidos[0].telefono)}</strong> ({telefonoBonito(d.parecidos[0].telefono)}).
          </span>
          <button type="submit">Unirlos</button>
        </form>
      )}

      <div className="fc-grid">
        <div className="fc-principal">
          {/* Qué sigue: una sola recomendación, armada por código */}
          <section className={`fc-sigue${sigue.urgente ? " urgente" : ""} fc-sigue-${sigue.motivo}`} aria-labelledby="fc-sigue-titulo">
            <p className="fc-sigue-etiqueta">Qué sigue</p>
            <h2 id="fc-sigue-titulo">{sigue.titulo}</h2>
            {sigue.detalle && <p className="fc-sigue-detalle">{sigue.detalle}</p>}
            <div className="fc-sigue-botones">
              <BotonAccion a={sigue.accion} primaria />
              {sigue.otra && <BotonAccion a={sigue.otra} />}
            </div>
          </section>

          <div className="cifras fc-cifras">
            <Cifra numero={diasCliente === 0 ? "Hoy" : diasCliente} Icono={IconoReloj} tono="azul">
              {diasCliente === 0 ? "llegó" : diasCliente === 1 ? "día desde que llegó" : "días desde que llegó"}
            </Cifra>
            <Cifra numero={d.diasSinMovimiento} Icono={IconoCampana} tono="ambar" alerta={activo && d.diasSinMovimiento >= DIAS_QUIETO}>
              {d.diasSinMovimiento === 1 ? "día sin movimiento" : "días sin movimiento"}
            </Cifra>
            <Cifra numero={hechas} Icono={IconoAgenda} tono="morado">
              {hechas === 1 ? "visita hecha" : "visitas hechas"}
              {proximas > 0 ? ` · ${proximas} ${proximas === 1 ? "próxima" : "próximas"}` : ""}
            </Cifra>
            {dinero && (
              <Cifra numero={plata(dinero.monto, dinero.moneda)} Icono={IconoEstrella} tono="verde" href={etapa === "cerrado" ? "#juego" : dinero.que.startsWith("presupuesto") ? "#busca" : "#juego"}>
                {dinero.que}
              </Cifra>
            )}
          </div>

          {/* El camino del cliente: también es el control para cambiar de etapa */}
          <section className="tarjeta fc-bloque">
            <div className="fc-bloque-cabeza">
              <h2 data-patty="cliente-etapa">¿En qué va?</h2>
              <span className="suave">
                {NOMBRE_ETAPA[etapa]} {diasEnEtapa === 0 ? "desde hoy" : `hace ${diasEnEtapa} ${diasEnEtapa === 1 ? "día" : "días"}`}
              </span>
            </div>
            <form action={cambiarEtapa} className="fc-camino">
              <input type="hidden" name="id" value={id} />
              <ol>
                {CAMINO.map((e, i) => {
                  const estado = e === etapa ? "actual" : indiceEtapa >= 0 && i < indiceEtapa ? "hecho" : "falta";
                  return (
                    <li key={e} className={`fc-paso ${estado} etapa-${e}`}>
                      <button type="submit" name="etapa" value={e} aria-pressed={e === etapa} aria-label={`${NOMBRE_ETAPA[e]}: ${AYUDA_ETAPA[e]}`}>
                        <span className="fc-paso-punto" aria-hidden>
                          {estado === "hecho" ? <IconoCheck tamano={16} /> : i + 1}
                        </span>
                        <span className="fc-paso-nombre">{NOMBRE_ETAPA[e]}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="fc-camino-ayuda">
                {etapa === "perdido" ? (
                  <>
                    <span className="etapa etapa-perdido">Perdido</span> Ya no sigue. Si vuelve, toca la etapa en la que va.
                  </>
                ) : (
                  <>
                    <strong>{NOMBRE_ETAPA[etapa]}:</strong> {AYUDA_ETAPA[etapa].toLowerCase()}. Toca otra etapa para moverlo.
                  </>
                )}
              </p>
            </form>
            {etapa === "perdido" && (
              <form action={cambiarEtapa} className="fc-motivo">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="etapa" value="perdido" />
                <p>
                  <strong>¿Por qué se perdió?</strong>
                  {c.motivo_perdida ? <span className="suave"> Ahora dice: {c.motivo_perdida}</span> : null}
                </p>
                <div className="fc-botones-motivo">
                  {MOTIVOS_PERDIDA.map((m) => (
                    <button key={m} type="submit" name="motivo" value={m} aria-pressed={m === c.motivo_perdida}>
                      {m}
                    </button>
                  ))}
                </div>
              </form>
            )}
          </section>

          <Historia eventos={d.eventos} contactoId={id} ahora={ahora} zona={zona} nombreAsistente={asistente} />
        </div>

        {/* Lo que se edita */}
        <aside className="fc-lateral">
          <section id="recordatorio" className={`tarjeta fc-bloque${venceRecordatorio ? " fc-vence" : ""}`}>
            <div className="fc-bloque-cabeza">
              <h2 data-patty="cliente-recordatorio">Recordatorio</h2>
              {c.seguimiento_fecha && (
                <span className={`fc-pastilla${venceRecordatorio ? " vence" : ""}`}>
                  {venceRecordatorio
                    ? c.seguimiento_fecha < hoy
                      ? "Atrasado"
                      : "Hoy"
                    : c.seguimiento_fecha === manana
                      ? "Mañana"
                      : diaLargo(new Date(`${c.seguimiento_fecha}T12:00:00Z`), "UTC")}
                </span>
              )}
            </div>
            <form action={guardarSeguimiento} className="fc-form">
              <input type="hidden" name="id" value={id} />
              <input
                data-patty="cliente-recordatorio-texto"
                id="nota"
                name="nota"
                type="text"
                aria-label="Qué tienes que hacer"
                defaultValue={c.seguimiento_nota ?? ""}
                placeholder="¿Qué tienes que hacer? Ej.: llamarla"
              />
              <div className="fc-atajos" role="group" aria-label="Cuándo">
                <button type="submit" name="dias" value="1">
                  Mañana
                </button>
                <button type="submit" name="dias" value="3">
                  En 3 días
                </button>
                <button type="submit" name="dias" value="7">
                  En 1 semana
                </button>
              </div>
              <div className="fc-fila-final">
                <details>
                  <summary>Otro día</summary>
                  <div className="fc-fila">
                    <input id="fecha" name="fecha" type="date" aria-label="Día" defaultValue={c.seguimiento_fecha ?? manana} />
                    <button type="submit" className="primario">
                      Guardar
                    </button>
                  </div>
                </details>
                {c.seguimiento_fecha && (
                  <button type="submit" name="quitar" value="1" className="fc-ya">
                    <IconoCheck tamano={18} />
                    Ya lo hice
                  </button>
                )}
              </div>
            </form>
          </section>

          <section id="juego" className="tarjeta fc-bloque" data-patty="cliente-oportunidad">
            {etapa === "cerrado" && c.cierre_precio ? (
              <>
                <div className="fc-bloque-cabeza">
                  <h2>Cerró</h2>
                  {c.cierre_at && <span className="suave">{diaLargo(new Date(c.cierre_at), zona)}</span>}
                </div>
                <div className="fc-cierre">
                  <span className="fc-cierre-casa">{d.casaCierre ? d.casaCierre.titulo : "Sin casa anotada"}</span>
                  <strong className="fc-cierre-precio">{montoExacto(Number(c.cierre_precio), monedaCierre)}</strong>
                  <span className="fc-comision">Tu comisión: {montoExacto(Number(c.cierre_comision ?? 0), monedaCierre)}</span>
                </div>
              </>
            ) : etapa === "cerrado" ? (
              <form action={guardarCierre} className="fc-form" id="cierre">
                <h2>¡Cerró! Anota cómo fue</h2>
                <input type="hidden" name="id" value={id} />
                <label htmlFor="cierre-casa">Casa</label>
                <select id="cierre-casa" name="casa" defaultValue={casaInteres?.id ?? ""}>
                  <option value="">Ninguna de mis casas</option>
                  {d.todas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titulo}
                    </option>
                  ))}
                </select>
                <label htmlFor="cierre-precio">{alquiler ? "Renta mensual" : "Precio final"}</label>
                <div className="fc-monto">
                  <input id="cierre-precio" name="precio" type="text" inputMode="numeric" required defaultValue={c.oferta_monto ?? casaInteres?.precio ?? ""} />
                  <select name="moneda" aria-label="Moneda" defaultValue={monedaEnJuego}>
                    <option value="USD">Dólares</option>
                    <option value="CRC">Colones</option>
                  </select>
                </div>
                <label htmlFor="cierre-comision">Tu comisión (vacía: {reglaComision(d.comisionPct, operacion)})</label>
                <input id="cierre-comision" name="comision" type="text" inputMode="numeric" placeholder={alquiler ? "Un mes de renta" : `${d.comisionPct}% del precio`} />
                <button type="submit" className="primario">
                  Guardar el cierre
                </button>
              </form>
            ) : (
              <>
                <div className="fc-bloque-cabeza">
                  <h2>Lo que está en juego</h2>
                </div>
                {casaInteres && (
                  <Link href={`/panel/propiedades/${casaInteres.id}`} className="fc-interes">
                    <FotoCasa fotos={casaInteres.fotos} tamano={28} />
                    <span>
                      <small>Le interesa</small>
                      <strong>{casaInteres.titulo}</strong>
                      {casaInteres.precio ? <span className="suave">{precio(casaInteres.precio, casaInteres.moneda)}</span> : null}
                    </span>
                  </Link>
                )}
                {valorEnJuego > 0 && (
                  <p className="fc-comision-estimada">
                    {c.oferta_monto ? "Ofreció" : "Vale"} <strong>{montoExacto(valorEnJuego, monedaEnJuego)}</strong>
                    {alquiler ? " al mes" : ""} · tu comisión <strong>{montoExacto(comisionEnJuego, monedaEnJuego)}</strong>{" "}
                    <span>({reglaComision(d.comisionPct, operacion)})</span>
                  </p>
                )}
                <details className="fc-editar" open={!casaInteres && !c.oferta_monto}>
                  <summary>{casaInteres || c.oferta_monto ? "Cambiar la casa o la oferta" : "Anotar la casa o la oferta"}</summary>
                  <form action={guardarOportunidad} className="fc-form">
                    <input type="hidden" name="id" value={id} />
                    <label htmlFor="op-casa">Casa que le interesa</label>
                    <select id="op-casa" name="casa" defaultValue={casaInteres?.id ?? ""}>
                      <option value="">Todavía ninguna</option>
                      {d.todas
                        .filter((p) => p.estado === "activa" || p.id === casaInteres?.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.titulo}
                            {p.precio ? ` · ${precio(p.precio, p.moneda)}` : ""}
                          </option>
                        ))}
                    </select>
                    <label htmlFor="op-oferta">{alquiler ? "Renta que ofrece (al mes)" : "Oferta del cliente"}</label>
                    <div className="fc-monto">
                      <input id="op-oferta" name="oferta" type="text" inputMode="numeric" defaultValue={c.oferta_monto ?? ""} placeholder="Si hizo una" />
                      <select name="oferta_moneda" aria-label="Moneda" defaultValue={monedaEnJuego}>
                        <option value="USD">Dólares</option>
                        <option value="CRC">Colones</option>
                      </select>
                    </div>
                    <button type="submit" className="primario">
                      Guardar
                    </button>
                  </form>
                </details>
              </>
            )}
          </section>

          <section id="busca" className="tarjeta fc-bloque">
            <div className="fc-bloque-cabeza">
              <h2 data-patty="cliente-busca">Qué busca</h2>
            </div>
            {datosBusca.length > 0 ? (
              <dl className="fc-busca">
                {datosBusca.map((x) => (
                  <div key={x.k}>
                    <dt>{x.k}</dt>
                    <dd>{x.v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="suave">Todavía no lo dijo. {asistente} lo anota sola cuando el cliente lo cuenta en el chat.</p>
            )}
            <details className="fc-editar">
              <summary>Corregirlo</summary>
              <form action={guardarBusca} className="fc-form">
                <input type="hidden" name="id" value={id} />
                <div className="fc-dos">
                  <div className="fc-campo">
                    <label htmlFor="operacion">Para</label>
                    <select id="operacion" name="operacion" defaultValue={busca.operacion ?? ""}>
                      <option value="">Sin decir</option>
                      <option value="venta">Comprar</option>
                      <option value="alquiler">Alquilar</option>
                    </select>
                  </div>
                  <div className="fc-campo">
                    <label htmlFor="tipo">Tipo</label>
                    <input id="tipo" name="tipo" type="text" defaultValue={busca.tipo ?? ""} placeholder="casa, apartamento…" />
                  </div>
                </div>
                <label htmlFor="zonas">Zonas (separadas por coma)</label>
                <input id="zonas" name="zonas" type="text" list="zonas-conocidas" defaultValue={(busca.zonas ?? []).join(", ")} placeholder="Escazú, Santa Ana" />
                <datalist id="zonas-conocidas">
                  {ZONAS_CONOCIDAS.map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
                <label htmlFor="presupuesto">Presupuesto máximo</label>
                <div className="fc-monto">
                  <input id="presupuesto" name="presupuesto" type="text" inputMode="numeric" defaultValue={busca.presupuesto_max ?? ""} />
                  <select id="moneda" name="moneda" aria-label="Moneda" defaultValue={busca.moneda ?? "USD"}>
                    <option value="USD">Dólares</option>
                    <option value="CRC">Colones</option>
                  </select>
                </div>
                <label htmlFor="habitaciones">Cuartos</label>
                <input id="habitaciones" name="habitaciones" type="number" min={0} defaultValue={busca.habitaciones ?? ""} />
                <button type="submit" className="primario">
                  Guardar
                </button>
              </form>
            </details>
          </section>

          <section id="casas" className="tarjeta fc-bloque">
            <div className="fc-bloque-cabeza">
              <h2>Casas que le encajan</h2>
              {casas.length > 0 && <span className="suave">{casas.length}</span>}
            </div>
            {casas.length === 0 ? (
              <Vacio
                Icono={IconoCasa}
                compacto
                titulo={sabeQueBusca ? "Ninguna le encaja todavía" : "Falta saber qué busca"}
                accion={<Link href="/panel/propiedades">Ver mis casas</Link>}
              >
                {sabeQueBusca ? "Cuando agregues una casa que le sirva, aparece aquí." : "Cuando sepas qué busca, aquí salen las casas que le sirven."}
              </Vacio>
            ) : (
              <ul className="fc-casas">
                {casas.map((p) => (
                  <li key={p.id} className={p.interes ? "interes" : undefined}>
                    <Link href={`/panel/propiedades/${p.id}`}>
                      <span className="fc-casa-foto">
                        <FotoCasa fotos={p.fotos} />
                        {p.interes && <span className="fc-casa-marca">Le interesa</span>}
                      </span>
                      <span className="fc-casa-texto">
                        <strong>{p.titulo}</strong>
                        {p.precio !== null && <span className="fc-casa-precio">{precio(p.precio, p.moneda)}</span>}
                        {p.zona && <span className="suave">{p.zona}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tarjeta fc-bloque">
            <div className="fc-bloque-cabeza">
              <h2 data-patty="cliente-notas">Notas</h2>
            </div>
            <p className={c.notas ? "fc-notas" : "suave"}>{c.notas ?? "Sin notas todavía."}</p>
            <details className="fc-editar">
              <summary>{c.notas ? "Editar" : "Escribir notas"}</summary>
              <form action={guardarNotas} className="fc-form">
                <input type="hidden" name="id" value={id} />
                <label htmlFor="nombre">Nombre</label>
                <input id="nombre" name="nombre" type="text" defaultValue={c.nombre ?? ""} />
                <label htmlFor="notas">Lo que quieras recordar</label>
                <textarea id="notas" name="notas" defaultValue={c.notas ?? ""} placeholder="Tiene dos hijos, busca colegio cerca, viene de Estados Unidos…" />
                <button type="submit" className="primario">
                  Guardar
                </button>
              </form>
            </details>
          </section>
        </aside>
      </div>

      {/* Lo de poco uso, plegado al final */}
      <div className="fc-mas">
        {etapa !== "perdido" && (
          <details className="tarjeta fc-plegado">
            <summary>¿Ya no sigue? Marcarlo como perdido</summary>
            <form action={cambiarEtapa} className="fc-motivo">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="etapa" value="perdido" />
              <p className="suave">Toca por qué se perdió: así sabes qué mejorar. Si vuelve, lo cambias de etapa.</p>
              <div className="fc-botones-motivo">
                {MOTIVOS_PERDIDA.map((m) => (
                  <button key={m} type="submit" name="motivo" value={m}>
                    {m}
                  </button>
                ))}
              </div>
            </form>
          </details>
        )}
        <details className="tarjeta fc-plegado">
          <summary>¿Es la misma persona que otro cliente?</summary>
          <form action={unirCliente} className="fc-form">
            <input type="hidden" name="id" value={id} />
            <label htmlFor="otro">Unir con</label>
            <select id="otro" name="otro" required defaultValue="">
              <option value="" disabled>
                Elige el otro cliente
              </option>
              {d.otros.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre ?? telefonoBonito(o.telefono)} · {telefonoBonito(o.telefono)}
                </option>
              ))}
            </select>
            <p className="suave">Sus chats, visitas e historia pasan a este cliente y se completan los datos que falten. Su teléfono queda en las notas.</p>
            <button type="submit">Unir</button>
          </form>
        </details>
      </div>
    </div>
  );
}
