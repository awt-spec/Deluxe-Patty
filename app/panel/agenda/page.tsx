import { headers } from "next/headers";
import Link from "next/link";
import { diaLargo, horaCorta } from "@/lib/agenda/formato";
import { aUtc, fechaIso, fechaLocal, minutosDe, minutosLocales, sumarDias, type FechaLocal } from "@/lib/agenda/tiempo";
import { minutosEntre } from "@/lib/agenda/zonas";
import { telefonoBonito } from "@/lib/crm/perfil";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { Aviso } from "../aviso";
import { PreguntarPatty } from "../preguntar-patty";
import { cambiarEnlaceCalendario } from "./acciones";

type Cita = {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  contacto_id: string;
  contactos: { nombre: string | null; telefono: string } | { nombre: string | null; telefono: string }[] | null;
  propiedades: { titulo: string; zona: string | null } | { titulo: string; zona: string | null }[] | null;
};

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const VISTAS = { dia: "Día", semana: "Semana", mes: "Mes", lista: "Lista" } as const;
type Vista = keyof typeof VISTAS;
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ALTO_HORA = 56;
// Un color por zona, siempre el mismo, para ver de un vistazo qué visitas quedan cerca.
const COLORES_ZONA = ["#3d7ea6", "#d1495b", "#25a18e", "#e09f3e", "#7b5ea7", "#5c946e", "#c2185b", "#00838f"];
function colorZona(zona: string | null | undefined): string {
  if (!zona) return "#9b958c";
  let h = 0;
  for (const c of zona.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_ZONA[h % COLORES_ZONA.length];
}

// Agenda como calendario: por día, por semana o por mes (y la lista de siempre). Las visitas salen en su
// hora, con el cliente y la casa; las horas en que no enseñas casas se ven grises.

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; vista?: string; fecha?: string }>;
}) {
  const { aviso, vista: pedida, fecha: fechaPedida } = await searchParams;
  // Sin elegir: en el teléfono el día (la semana no cabe), en computadora la semana.
  const telefono = /Mobi|Android|iPhone/i.test((await headers()).get("user-agent") ?? "");
  const vista: Vista = pedida && pedida in VISTAS ? (pedida as Vista) : telefono ? "dia" : "semana";
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const hoy = fechaLocal(new Date(), zona);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(fechaPedida ?? "") ? deIso(fechaPedida!) : hoy;

  // Rango que se ve: el día, la semana (lunes a domingo), el mes completo o los próximos 60 días.
  let primerDia: FechaLocal;
  let dias: number;
  if (vista === "dia") {
    primerDia = base;
    dias = 1;
  } else if (vista === "semana") {
    primerDia = sumarDias(base, -((base.diaSemana + 6) % 7));
    dias = 7;
  } else if (vista === "mes") {
    const uno1 = { ...base, dia: 1, diaSemana: new Date(Date.UTC(base.anio, base.mes - 1, 1)).getUTCDay() };
    primerDia = sumarDias(uno1, -((uno1.diaSemana + 6) % 7));
    dias = 42;
  } else {
    primerDia = hoy;
    dias = 60;
  }
  const desde = aUtc(primerDia, 0, zona);
  const hasta = aUtc(sumarDias(primerDia, dias), 0, zona);

  const [{ data }, { data: horariosData }, { data: bloqueosData }] = await Promise.all([
    supabase
      .from("citas")
      .select("id, inicio, fin, estado, contacto_id, contactos(nombre, telefono), propiedades(titulo, zona)")
      .eq("corredor_id", corredor.id)
      .in("estado", ["agendada", "confirmada"])
      .gte("inicio", desde.toISOString())
      .lt("inicio", hasta.toISOString())
      .order("inicio")
      .limit(300),
    supabase.from("horarios_visitas").select("dia_semana, hora_inicio, hora_fin").eq("corredor_id", corredor.id),
    supabase
      .from("bloqueos_agenda")
      .select("inicio, fin")
      .eq("corredor_id", corredor.id)
      .lt("inicio", hasta.toISOString())
      .gt("fin", desde.toISOString()),
  ]);
  const citas = (data ?? []) as Cita[];
  const horarios = (horariosData ?? []) as { dia_semana: number; hora_inicio: string; hora_fin: string }[];
  const bloqueos = (bloqueosData ?? []) as { inicio: string; fin: string }[];

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

  // Horas que se dibujan: de 7 a 19, o más si alguna visita cae fuera.
  let horaMin = 7;
  let horaMax = 19;
  for (const c of citas) {
    horaMin = Math.min(horaMin, Math.floor(minutosLocales(new Date(c.inicio), zona) / 60));
    horaMax = Math.max(horaMax, Math.ceil(minutosLocales(new Date(c.fin), zona) / 60));
  }
  const horas = Array.from({ length: horaMax - horaMin }, (_, i) => horaMin + i);
  const y = (min: number) => ((min - horaMin * 60) / 60) * ALTO_HORA;

  const enlaceA = (v: Vista, f: FechaLocal) => `/panel/agenda?vista=${v}&fecha=${fechaIso(f)}`;
  const paso = vista === "dia" ? 1 : vista === "semana" ? 7 : 0;
  const anterior = vista === "mes" ? { ...base, mes: base.mes === 1 ? 12 : base.mes - 1, anio: base.mes === 1 ? base.anio - 1 : base.anio, dia: 1 } : sumarDias(base, -paso);
  const siguiente = vista === "mes" ? { ...base, mes: base.mes === 12 ? 1 : base.mes + 1, anio: base.mes === 12 ? base.anio + 1 : base.anio, dia: 1 } : sumarDias(base, paso);
  const titulo =
    vista === "dia"
      ? capitalizar(diaLargo(aUtc(base, 12 * 60, zona), zona))
      : vista === "semana"
        ? rangoSemana(primerDia)
        : vista === "mes"
          ? `${capitalizar(MESES[base.mes - 1])} ${base.anio}`
          : "Próximas visitas";
  const diasVista = Array.from({ length: vista === "dia" ? 1 : 7 }, (_, i) => sumarDias(primerDia, i));
  const esHoy = (f: FechaLocal) => fechaIso(f) === fechaIso(hoy);

  const bloque = (c: Cita) => {
    const contacto = uno(c.contactos);
    const propiedad = uno(c.propiedades);
    const ini = minutosLocales(new Date(c.inicio), zona);
    const fin = Math.max(ini + 30, minutosLocales(new Date(c.fin), zona));
    return (
      <Link
        key={c.id}
        href={`/panel/agenda/visita/${c.id}`}
        className={`cal-cita${c.estado === "confirmada" ? " confirmada" : ""}`}
        style={{ top: y(ini), height: Math.max(28, y(fin) - y(ini) - 2), borderLeftColor: colorZona(propiedad?.zona) }}
        title={c.estado === "confirmada" ? "Confirmada" : "Por confirmar"}
      >
        <strong>
          {horaCorta(new Date(c.inicio), zona)} · {contacto?.nombre ?? (contacto ? telefonoBonito(contacto.telefono) : "")}
        </strong>
        {propiedad && (
          <span>
            {propiedad.titulo}
            {propiedad.zona ? ` · ${propiedad.zona}` : ""}
          </span>
        )}
      </Link>
    );
  };

  const columna = (f: FechaLocal) => {
    const franjas = horarios.filter((h) => h.dia_semana === f.diaSemana);
    const inicioDia = aUtc(f, 0, zona).getTime();
    const finDia = aUtc(sumarDias(f, 1), 0, zona).getTime();
    return (
      <div key={fechaIso(f)} className={`cal-columna${esHoy(f) ? " hoy" : ""}`} style={{ height: horas.length * ALTO_HORA }}>
        {franjas.map((h, i) => (
          <span key={i} className="cal-libre" style={{ top: y(minutosDe(h.hora_inicio)), height: y(minutosDe(h.hora_fin)) - y(minutosDe(h.hora_inicio)) }} />
        ))}
        {bloqueos
          .filter((b) => Date.parse(b.inicio) < finDia && Date.parse(b.fin) > inicioDia)
          .map((b, i) => {
            const ini = Date.parse(b.inicio) <= inicioDia ? horaMin * 60 : minutosLocales(new Date(b.inicio), zona);
            const fin = Date.parse(b.fin) >= finDia ? horaMax * 60 : minutosLocales(new Date(b.fin), zona);
            return <span key={`b${i}`} className="cal-bloqueo" style={{ top: y(ini), height: Math.max(0, y(fin) - y(ini)) }} title="Bloqueado" />;
          })}
        {/* Horas libres: se tocan para agendar una visita a esa hora. */}
        {franjas.flatMap((h) =>
          Array.from({ length: Math.floor((minutosDe(h.hora_fin) - minutosDe(h.hora_inicio)) / 60) }, (_, i) => minutosDe(h.hora_inicio) + i * 60),
        ).map((m) => {
          const libreHasta = aUtc(f, m + 60, zona).getTime();
          if (libreHasta < Date.now()) return null;
          const hh = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          return (
            <Link
              key={`n${m}`}
              href={`/panel/agenda/nueva?fecha=${fechaIso(f)}&hora=${hh}`}
              className="cal-agendar"
              style={{ top: y(m), height: ALTO_HORA }}
              aria-label={`Agendar a las ${hh}`}
            >
              <span>+ Agendar</span>
            </Link>
          );
        })}
        {(porDia.get(fechaIso(f)) ?? []).map(bloque)}
        {/* La hora de ahora, como en el calendario del teléfono. */}
        {esHoy(f) && (() => {
          const m = minutosLocales(new Date(), zona);
          return m >= horaMin * 60 && m <= horaMax * 60 ? <span className="cal-ahora" style={{ top: y(m) }} aria-hidden /> : null;
        })()}
        {/* Traslado entre visitas seguidas: en rojo si no da tiempo de llegar. */}
        {(porDia.get(fechaIso(f)) ?? []).slice(1).map((c, i) => {
          const antes = (porDia.get(fechaIso(f)) ?? [])[i];
          const de = uno(antes.propiedades)?.zona;
          const a = uno(c.propiedades)?.zona;
          const min = minutosEntre(de, a);
          if (min === null) return null;
          const hueco = (Date.parse(c.inicio) - Date.parse(antes.fin)) / 60_000;
          const finAntes = minutosLocales(new Date(antes.fin), zona);
          return (
            <span key={`t${c.id}`} className={`cal-traslado${hueco < min ? " no-da" : ""}`} style={{ top: y(finAntes) }}>
              {hueco < min ? `No da tiempo: ${min} min a ${a}` : `${min} min a ${a}`}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <header className="encabezado">
        <h1>Agenda</h1>
        <div className="botones">
          <Link data-patty="agenda-agendar" href={`/panel/agenda/nueva?fecha=${fechaIso(base)}`} className="boton primario">
            + Agendar
          </Link>
          <Link data-patty="agenda-horario" href="/panel/agenda/horario" className="boton">
            Mi horario
          </Link>
        </div>
      </header>
      <Aviso texto={aviso} />
      <div className="preguntas-patty">
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Qué visitas tengo esta semana?" />
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Cómo agendo una visita?" />
      </div>

      <nav className="cal-vistas" aria-label="Cómo ver la agenda">
        {(Object.keys(VISTAS) as Vista[]).map((v) => (
          <Link key={v} data-patty={`agenda-vista-${v}`} href={enlaceA(v, base)} aria-current={v === vista ? "page" : undefined}>
            {VISTAS[v]}
          </Link>
        ))}
      </nav>

      {vista !== "lista" && (
        <div className="cal-barra">
          <Link href={enlaceA(vista, anterior)} className="boton" aria-label="Anterior">
            ‹
          </Link>
          <Link href={enlaceA(vista, hoy)} className="boton">
            Hoy
          </Link>
          <Link href={enlaceA(vista, siguiente)} className="boton" aria-label="Siguiente">
            ›
          </Link>
          <h2>{titulo}</h2>
        </div>
      )}

      {(vista === "dia" || vista === "semana") && (
        <div className={`cal cal-${vista}`}>
          <div className="cal-cabecera">
            <span />
            {diasVista.map((f) => (
              <Link key={fechaIso(f)} href={enlaceA("dia", f)} className={esHoy(f) ? "hoy" : undefined}>
                <small>{DIAS_CORTOS[f.diaSemana]}</small> <strong>{f.dia}</strong>
              </Link>
            ))}
          </div>
          <div className="cal-cuerpo">
            <div className="cal-horas">
              {horas.map((hh) => (
                <span key={hh} style={{ height: ALTO_HORA }}>
                  {hh <= 12 ? hh : hh - 12} {hh < 12 ? "a. m." : "p. m."}
                </span>
              ))}
            </div>
            {diasVista.map(columna)}
          </div>
          {citas.length === 0 && (
            <p className="vacio">{vista === "dia" ? "Este día no tienes visitas." : "Esta semana no tienes visitas."}</p>
          )}
          <p className="suave cal-leyenda">
            <span className="muestra libre" /> Toca una hora libre para agendar <span className="muestra bloqueo" /> Bloqueado
            {[...new Set(citas.map((c) => uno(c.propiedades)?.zona).filter((z): z is string => !!z))].map((z) => (
              <span key={z} className="zona-leyenda">
                <span className="muestra" style={{ background: colorZona(z) }} /> {z}
              </span>
            ))}
          </p>
        </div>
      )}

      {vista === "mes" && (
        <div className="cal-mes">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <span key={d} className="cal-mes-dia-semana">
              {d}
            </span>
          ))}
          {Array.from({ length: 42 }, (_, i) => sumarDias(primerDia, i)).map((f) => {
            const lista = porDia.get(fechaIso(f)) ?? [];
            return (
              <Link
                key={fechaIso(f)}
                href={enlaceA("dia", f)}
                className={`cal-mes-celda${f.mes !== base.mes ? " otro-mes" : ""}${esHoy(f) ? " hoy" : ""}`}
              >
                <strong>{f.dia}</strong>
                {lista.slice(0, 2).map((c) => (
                  <span key={c.id} className="cal-mes-cita" style={{ borderLeft: `3px solid ${colorZona(uno(c.propiedades)?.zona)}` }}>
                    {horaCorta(new Date(c.inicio), zona)} {uno(c.contactos)?.nombre ?? "Visita"}
                  </span>
                ))}
                {lista.length > 2 && <span className="suave">y {lista.length - 2} más</span>}
              </Link>
            );
          })}
        </div>
      )}

      {vista === "lista" && citas.length === 0 && (
        <p className="vacio">No tienes visitas agendadas. Cuando la asistente agende una, aparece aquí.</p>
      )}
      {vista === "lista" &&
        [...porDia.entries()].map(([dia, lista]) => (
          <section key={dia}>
            <h2>{diaLargo(new Date(lista[0].inicio), zona)}</h2>
            {lista.map((c) => {
              const contacto = uno(c.contactos);
              const propiedad = uno(c.propiedades);
              return (
                <Link key={c.id} href={`/panel/agenda/visita/${c.id}`} className="tarjeta acento fila">
                  <div>
                    <strong>{horaCorta(new Date(c.inicio), zona)}</strong> · {contacto?.nombre ?? (contacto ? telefonoBonito(contacto.telefono) : "")}
                    {propiedad && <p className="suave">{propiedad.titulo}</p>}
                  </div>
                  <span className={`insignia ${c.estado === "confirmada" ? "dorada" : ""}`}>
                    {c.estado === "confirmada" ? "Confirmada" : "Por confirmar"}
                  </span>
                </Link>
              );
            })}
          </section>
        ))}

      {enlace && (
        <details className="tarjeta pila" style={{ marginTop: 20 }}>
          <summary>Ver las visitas en el calendario de tu teléfono</summary>
          <p className="suave">Agrégalo una vez y tus visitas salen solas en tu calendario. No lo compartas.</p>
          <a href={`webcal://${enlace}`} className="boton primario">
            Suscribirme desde el iPhone
          </a>
          <p className="suave">En Google Calendar: “Otros calendarios” y luego “Desde URL” y pega este enlace:</p>
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

function deIso(iso: string): FechaLocal {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return { anio, mes, dia, diaSemana: new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() };
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "9 al 15 de noviembre" o "30 de noviembre al 6 de diciembre". */
function rangoSemana(lunes: FechaLocal): string {
  const domingo = sumarDias(lunes, 6);
  return lunes.mes === domingo.mes
    ? `${lunes.dia} al ${domingo.dia} de ${MESES[domingo.mes - 1]}`
    : `${lunes.dia} de ${MESES[lunes.mes - 1]} al ${domingo.dia} de ${MESES[domingo.mes - 1]}`;
}
