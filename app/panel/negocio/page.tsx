import Link from "next/link";
import { fechaIso, fechaLocal } from "@/lib/agenda/tiempo";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { PreguntarPatty } from "../preguntar-patty";
import { Volver } from "../volver";

// Cómo va el negocio: ingresos y cierres por mes, de dónde vienen los clientes que cierran, cuántos
// avanzan en cada etapa, cuánto tardan en cerrar, por qué se pierden y cómo va la captación de casas.
// Todo con la sesión del corredor (RLS) y en palabras de todos los días.

type Cliente = {
  etapa: string;
  origen: string;
  created_at: string;
  cierre_at: string | null;
  cierre_comision: number | null;
  cierre_precio: number | null;
  motivo_perdida: string | null;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ORIGEN: Record<string, string> = {
  anuncio: "Anuncios de Encuentra24",
  whatsapp: "WhatsApp directo",
  referido: "Recomendados",
  correo: "Correo",
  busqueda: "Búsqueda de dueños",
  otro: "Otro medio",
};
const ORDEN: Record<string, number> = { nuevo: 0, interesado: 1, visita: 2, negociando: 3, cerrado: 4, perdido: -1 };

const plata = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M` : n >= 1000 ? `$${Math.round(n / 1000)} mil` : `$${Math.round(n)}`;

export default async function Negocio() {
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const hoy = fechaLocal(new Date(), zona);
  const [{ data }, { data: duenos }, { data: uso }] = await Promise.all([
    supabase
      .from("contactos")
      .select("etapa, origen, created_at, cierre_at, cierre_comision, cierre_precio, motivo_perdida")
      .eq("corredor_id", corredor.id)
      .eq("es_corredor", false)
      .limit(2000),
    supabase.from("leads_duenos").select("estado_contacto").eq("corredor_id", corredor.id).eq("es_dueno", true).limit(2000),
    supabase.from("uso_mensual").select("mes, mensajes_total").eq("corredor_id", corredor.id).order("mes", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const clientes = (data ?? []) as Cliente[];
  const cerrados = clientes.filter((c) => c.etapa === "cerrado");

  // Últimos 6 meses: comisiones y cierres.
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(hoy.anio, hoy.mes - 1 - (5 - i), 1));
    const clave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const delMes = cerrados.filter((c) => (c.cierre_at ?? "").slice(0, 7) === clave);
    return {
      clave,
      nombre: MESES[d.getUTCMonth()],
      cierres: delMes.length,
      ganado: delMes.reduce((s, c) => s + Number(c.cierre_comision ?? 0), 0),
      nuevos: clientes.filter((c) => c.created_at.slice(0, 7) === clave).length,
    };
  });
  const maxGanado = Math.max(1, ...meses.map((m) => m.ganado));
  const esteMes = meses[5];
  const mesPasado = meses[4];
  const ganadoAnio = cerrados.filter((c) => (c.cierre_at ?? "").slice(0, 4) === String(hoy.anio)).reduce((s, c) => s + Number(c.cierre_comision ?? 0), 0);

  // Hasta dónde llegan: de cada 10 clientes que escriben.
  const llego = (k: number) => clientes.filter((c) => ORDEN[c.etapa] >= k).length;
  const total = clientes.length;
  const pasos = [
    { nombre: "Preguntaron por casas", n: llego(1) },
    { nombre: "Fueron a ver una casa", n: llego(2) },
    { nombre: "Negociaron", n: llego(3) },
    { nombre: "Cerraron", n: llego(4) },
  ];

  // De dónde vienen (y cuántos de esos cierran).
  const origenes = Object.keys(ORIGEN)
    .map((o) => ({ o, todos: clientes.filter((c) => c.origen === o).length, cierran: cerrados.filter((c) => c.origen === o).length }))
    .filter((x) => x.todos > 0)
    .sort((a, b) => b.cierran - a.cierran || b.todos - a.todos);
  const maxOrigen = Math.max(1, ...origenes.map((x) => x.todos));

  const diasCierre = cerrados
    .filter((c) => c.cierre_at)
    .map((c) => (Date.parse(c.cierre_at!) - Date.parse(c.created_at)) / 86_400_000);
  const promedioDias = diasCierre.length ? Math.round(diasCierre.reduce((s, d) => s + d, 0) / diasCierre.length) : null;

  const motivos = new Map<string, number>();
  for (const c of clientes) if (c.etapa === "perdido") motivos.set(c.motivo_perdida ?? "Sin motivo anotado", (motivos.get(c.motivo_perdida ?? "Sin motivo anotado") ?? 0) + 1);
  const listaMotivos = [...motivos].sort((a, b) => b[1] - a[1]);
  const perdidos = clientes.filter((c) => c.etapa === "perdido").length;

  const cuentaDuenos = (e: string) => (duenos ?? []).filter((d) => d.estado_contacto === e).length;

  return (
    <>
      <Volver href="/panel/mas" texto="Más" />
      <header className="encabezado">
        <div>
          <h1>Cómo va el negocio</h1>
          <p className="suave">Con lo que anotas en Clientes y lo que hace la asistente.</p>
        </div>
      </header>
      <div className="preguntas-patty">
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Cómo va el mes comparado con el anterior?" />
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Qué puedo hacer para cerrar más?" />
      </div>

      <div className="cifras embudo-cifras">
        <div className="tarjeta cifra">
          <strong>{plata(esteMes.ganado)}</strong>
          <span className="suave">
            ganado este mes{mesPasado.ganado > 0 ? ` (el pasado: ${plata(mesPasado.ganado)})` : ""}
          </span>
        </div>
        <div className="tarjeta cifra">
          <strong>{plata(ganadoAnio)}</strong>
          <span className="suave">ganado en {hoy.anio}</span>
        </div>
        <div className="tarjeta cifra">
          <strong>{esteMes.nuevos}</strong>
          <span className="suave">clientes nuevos este mes</span>
        </div>
        <div className="tarjeta cifra">
          <strong>{promedioDias ?? "—"}</strong>
          <span className="suave">{promedioDias === null ? "días hasta cerrar (todavía sin cierres)" : "días en promedio hasta cerrar"}</span>
        </div>
      </div>

      <section className="tarjeta pila negocio-seccion">
        <h2>Lo ganado mes a mes</h2>
        <div className="barras-mes" role="img" aria-label="Comisiones de los últimos seis meses">
          {meses.map((m) => (
            <div key={m.clave} className="barra-mes">
              <span className="barra-valor">{m.ganado > 0 ? plata(m.ganado) : ""}</span>
              <span className="barra" style={{ height: `${Math.max(2, (m.ganado / maxGanado) * 100)}%` }} />
              <span className="barra-nombre">{m.nombre}</span>
              <span className="suave barra-cierres">{m.cierres ? `${m.cierres} ${m.cierres === 1 ? "cierre" : "cierres"}` : "—"}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="negocio-columnas">
        <section className="tarjeta pila negocio-seccion">
          <h2>Hasta dónde llegan los clientes</h2>
          {total === 0 ? (
            <p className="suave">Todavía no hay clientes.</p>
          ) : (
            <>
              <p className="suave">De {total} {total === 1 ? "cliente que escribió" : "clientes que escribieron"}:</p>
              {pasos.map((p) => (
                <div key={p.nombre} className="fila-barra">
                  <span>{p.nombre}</span>
                  <span className="barra-h">
                    <span style={{ width: `${(p.n / total) * 100}%` }} />
                  </span>
                  <strong>
                    {p.n} <span className="suave">({Math.round((p.n / total) * 100)}%)</span>
                  </strong>
                </div>
              ))}
            </>
          )}
        </section>

        <section className="tarjeta pila negocio-seccion">
          <h2>De dónde vienen</h2>
          {origenes.length === 0 ? (
            <p className="suave">Todavía no hay clientes.</p>
          ) : (
            origenes.map((x) => (
              <div key={x.o} className="fila-barra">
                <span>{ORIGEN[x.o]}</span>
                <span className="barra-h">
                  <span style={{ width: `${(x.todos / maxOrigen) * 100}%` }} />
                </span>
                <strong>
                  {x.todos} <span className="suave">· {x.cierran} {x.cierran === 1 ? "cerró" : "cerraron"}</span>
                </strong>
              </div>
            ))
          )}
        </section>

        <section className="tarjeta pila negocio-seccion">
          <h2>Por qué se pierden</h2>
          {perdidos === 0 ? (
            <p className="suave">No has perdido clientes. Cuando pase, anota por qué en su ficha.</p>
          ) : (
            listaMotivos.map(([m, n]) => (
              <div key={m} className="fila-barra">
                <span>{m}</span>
                <span className="barra-h perdida">
                  <span style={{ width: `${(n / perdidos) * 100}%` }} />
                </span>
                <strong>{n}</strong>
              </div>
            ))
          )}
        </section>

        <section className="tarjeta pila negocio-seccion">
          <h2>Casas conseguidas con dueños</h2>
          <p>
            <strong>{cuentaDuenos("publicada")}</strong> publicadas · {cuentaDuenos("captado")} firmadas por publicar ·{" "}
            {cuentaDuenos("contactado") + cuentaDuenos("respondio") + cuentaDuenos("visitada")} en conversación ·{" "}
            {cuentaDuenos("nuevo")} por escribirles
          </p>
          <Link href="/panel/duenos">Ver dueños directos</Link>
          {uso && (
            <p className="suave">
              La asistente atendió {Number(uso.mensajes_total ?? 0).toLocaleString("es-CR")} mensajes este mes.
            </p>
          )}
        </section>
      </div>
      <p className="suave">Actualizado al {fechaIso(hoy)}.</p>
    </>
  );
}
