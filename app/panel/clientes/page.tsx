import Link from "next/link";
import { comisionEstimada, hayMonto, monedaDe, plataMontos, sumar, type Moneda } from "@/lib/crm/dinero";
import { fechaIso, fechaLocal } from "@/lib/agenda/tiempo";
import { AYUDA_ETAPA, ETAPAS, NOMBRE_ETAPA, resumenBusca, telefonoBonito, type Busca, type Etapa } from "@/lib/crm/perfil";
import { fechaCorta } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Avatar, colorEInicial } from "../avatar";
import { IconoAgregar } from "../iconos";
import { Tablero, type ColumnaTablero } from "./tablero";

// Clientes por etapa, como un embudo: arriba las cifras que importan (activos, cuánto hay en juego,
// cuántos cerraron este mes, quiénes necesitan atención), en el teléfono una lista por etapa y en la
// computadora un tablero donde cada cliente se arrastra de una etapa a otra.

type Cliente = {
  id: string;
  nombre: string | null;
  telefono: string;
  etapa: Etapa;
  etapa_at: string;
  busca: Busca;
  seguimiento_fecha: string | null;
  seguimiento_nota: string | null;
  motivo_perdida: string | null;
  updated_at: string;
  ultima_actividad_at: string | null;
  oferta_monto: number | null;
  oferta_moneda: string;
  cierre_moneda: string;
  propiedad_interes_id: string | null;
  cierre_precio: number | null;
  cierre_comision: number | null;
  cierre_at: string | null;
};

const DIA = 24 * 60 * 60_000;
// Días sin movimiento a partir de los cuales un cliente "necesita atención", por etapa.
const ESTANCADO: Partial<Record<Etapa, number>> = { nuevo: 2, interesado: 7, visita: 5, negociando: 7 };
// Un alquiler se decide en días: se avisa antes.
const ESTANCADO_ALQUILER: Partial<Record<Etapa, number>> = { nuevo: 1, interesado: 3, visita: 2, negociando: 3 };

export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string; q?: string; ver?: string; tipo?: string }>;
}) {
  const { etapa: pedida, q, ver, tipo: tipoPedido } = await searchParams;
  // Compras y alquileres se ven por separado (o todos): sus tiempos son distintos.
  const tipo = tipoPedido === "compras" || tipoPedido === "alquileres" ? tipoPedido : null;
  const enlace = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(tipo ? { tipo } : {}), ...extra });
    return `/panel/clientes${p.toString() ? `?${p}` : ""}`;
  };
  const buscar = (q ?? "").trim().toLowerCase();
  const digitos = buscar.replace(/\D/g, "");
  const { supabase, corredor } = await sesionConCorredor();
  const [{ data, error }, { data: citasData }] = await Promise.all([
    supabase
      .from("contactos")
      .select("id, nombre, telefono, etapa, etapa_at, busca, seguimiento_fecha, seguimiento_nota, motivo_perdida, updated_at, ultima_actividad_at, oferta_monto, oferta_moneda, propiedad_interes_id, cierre_precio, cierre_comision, cierre_moneda, cierre_at")
      .eq("corredor_id", corredor.id)
      .eq("es_corredor", false)
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("citas")
      .select("contacto_id, inicio, propiedad_id, propiedades(titulo)")
      .eq("corredor_id", corredor.id)
      .order("inicio", { ascending: false })
      .limit(500),
  ]);
  const { data: preciosData } = await supabase.from("propiedades").select("id, precio, moneda, operacion").eq("corredor_id", corredor.id);
  const casasPorId = new Map(((preciosData ?? []) as { id: string; precio: number | null; moneda: string; operacion: string }[]).map((p) => [p.id, p]));
  // Compra o alquiler: lo que dijo que busca o, si no, la operación de la casa que le interesa.
  const operacion = (c: Cliente) => c.busca?.operacion ?? (c.propiedad_interes_id ? casasPorId.get(c.propiedad_interes_id)?.operacion : undefined);
  const todos = ((data ?? []) as Cliente[]).filter(
    (c) => !tipo || (tipo === "alquileres" ? operacion(c) === "alquiler" : operacion(c) !== "alquiler"),
  );
  // La última casa que fue (o va) a ver cada cliente.
  const casaDe = new Map<string, string>();
  const casaVistaDe = new Map<string, string>();
  for (const c of (citasData ?? []) as { contacto_id: string; propiedad_id: string | null; propiedades: { titulo: string } | { titulo: string }[] | null }[]) {
    const p = Array.isArray(c.propiedades) ? c.propiedades[0] : c.propiedades;
    if (p && !casaDe.has(c.contacto_id)) casaDe.set(c.contacto_id, p.titulo);
    if (c.propiedad_id && !casaVistaDe.has(c.contacto_id)) casaVistaDe.set(c.contacto_id, c.propiedad_id);
  }

  const ahora = Date.now();
  const hoy = fechaIso(fechaLocal(new Date(), corredor.zona_horaria));
  const mes = hoy.slice(0, 7);
  const dias = (c: Cliente) => Math.max(0, Math.floor((ahora - Date.parse(c.etapa_at)) / DIA));
  // Días sin que pase nada: cuenta lo último entre el cambio de etapa y lo anotado en su historia.
  const quieto = (c: Cliente) =>
    Math.max(0, Math.floor((ahora - Math.max(Date.parse(c.etapa_at), c.ultima_actividad_at ? Date.parse(c.ultima_actividad_at) : 0)) / DIA));
  const activo = (c: Cliente) => c.etapa !== "cerrado" && c.etapa !== "perdido";
  // Necesita atención: lleva mucho en su etapa y no tiene un recordatorio a futuro.
  const estancado = (c: Cliente) =>
    activo(c) && quieto(c) >= ((operacion(c) === "alquiler" ? ESTANCADO_ALQUILER : ESTANCADO)[c.etapa] ?? 99) && !(c.seguimiento_fecha && c.seguimiento_fecha > hoy);
  const vence = (c: Cliente) => !!c.seguimiento_fecha && c.seguimiento_fecha <= hoy;

  const activos = todos.filter(activo);
  // Dinero real: lo que vale lo que se está negociando (la oferta, o el precio de la casa que le
  // interesa) y lo que ya se ganó este mes en comisiones.
  // Dólares y colones nunca se suman entre sí. Lo que vale cada negocio: la oferta en su moneda o el
  // precio de la casa que le interesa; la comisión, un porcentaje en venta y un mes de renta en alquiler.
  const valorDe = (c: Cliente): { monto: number; moneda: Moneda } => {
    if (c.oferta_monto) return { monto: Number(c.oferta_monto), moneda: monedaDe(c.oferta_moneda) };
    const casa = c.propiedad_interes_id ? casasPorId.get(c.propiedad_interes_id) : undefined;
    return { monto: Number(casa?.precio ?? 0), moneda: monedaDe(casa?.moneda) };
  };
  const comisionDe = (c: Cliente) => {
    const v = valorDe(c);
    return { monto: comisionEstimada(v.monto, corredor.comision_pct, operacion(c)), moneda: v.moneda };
  };
  const negociando = activos.filter((c) => c.etapa === "negociando");
  const enNegociacion = sumar(negociando.map(valorDe));
  const comisionPosible = sumar(negociando.map(comisionDe));
  const cerradosMes = todos.filter((c) => c.etapa === "cerrado" && (c.cierre_at ?? c.etapa_at).slice(0, 7) === mes);
  const ganadoMes = sumar(cerradosMes.map((c) => ({ monto: Number(c.cierre_comision ?? 0), moneda: monedaDe(c.cierre_moneda) })));
  const atencion = todos.filter((c) => estancado(c) || vence(c));
  const perdidos = todos.filter((c) => c.etapa === "perdido");
  const motivos = new Map<string, number>();
  for (const c of perdidos) if (c.motivo_perdida) motivos.set(c.motivo_perdida, (motivos.get(c.motivo_perdida) ?? 0) + 1);
  const motivoPrincipal = [...motivos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const terminados = todos.filter((c) => !activo(c)).length;
  const deCadaDiez = terminados >= 3 ? Math.round((todos.filter((c) => c.etapa === "cerrado").length / terminados) * 10) : null;

  // Lo que se muestra: búsqueda, etapa elegida o "necesitan atención".
  const coincide = (c: Cliente) =>
    !buscar || (c.nombre ?? "").toLowerCase().includes(buscar) || (digitos.length >= 3 && c.telefono.includes(digitos));
  const clientes = todos.filter(coincide);
  const elegida = (ETAPAS as readonly string[]).includes(pedida ?? "") ? (pedida as Etapa) : null;
  const verAtencion = ver === "atencion";
  const visibles = verAtencion
    ? clientes.filter((c) => estancado(c) || vence(c))
    : elegida
      ? clientes.filter((c) => c.etapa === elegida)
      : clientes.filter(activo);
  const cuantos = (e: Etapa) => clientes.filter((c) => c.etapa === e).length;

  const recordatorio = (c: Cliente) =>
    c.seguimiento_fecha
      ? { texto: `${vence(c) ? "Hoy" : fechaCorta(c.seguimiento_fecha)}: ${c.seguimiento_nota ?? "escribirle"}`, vence: vence(c) }
      : null;
  const textoDias = (c: Cliente) =>
    estancado(c) ? `Sin movimiento hace ${quieto(c)} días` : dias(c) === 0 ? "Llegó a esta etapa hoy" : `En esta etapa hace ${dias(c)} ${dias(c) === 1 ? "día" : "días"}`;

  const tarjeta = (c: Cliente) => {
    const r = recordatorio(c);
    return (
      <Link key={c.id} href={`/panel/clientes/${c.id}`} className="cliente-tarjeta">
        <span className="cliente-cabeza">
          <Avatar nombre={c.nombre} telefono={c.telefono} />
          <strong className="cliente-nombre">{c.nombre ?? telefonoBonito(c.telefono)}</strong>
          {!elegida && <span className={`etapa etapa-${c.etapa}`}>{NOMBRE_ETAPA[c.etapa]}</span>}
        </span>
        <span className="cliente-texto">
          <span className="suave">{resumenBusca(c.busca ?? {}) || "Todavía no dijo qué busca"}</span>
          {casaDe.get(c.id) && <span className="suave">Le interesa: {casaDe.get(c.id)}</span>}
          {r && <span className={`seguimiento${r.vence ? " vence" : ""}`}>{r.texto}</span>}
          {c.etapa === "perdido" && c.motivo_perdida && <span className="suave">{c.motivo_perdida}</span>}
          {activo(c) && <span className={`dias-etapa${estancado(c) ? " estancado" : ""}`}>{textoDias(c)}</span>}
        </span>
      </Link>
    );
  };

  // Tablero de la computadora: valor por columna (compras en dólares) y tarjetas listas para arrastrar.
  const columnas: ColumnaTablero[] = ETAPAS.filter((e) => e !== "perdido").map((e) => {
    const lista = clientes.filter((c) => c.etapa === e);
    const suma = sumar(lista.map((c) => (e === "cerrado" ? { monto: Number(c.cierre_precio ?? 0), moneda: monedaDe(c.cierre_moneda) } : valorDe(c))));
    return {
      etapa: e,
      nombre: NOMBRE_ETAPA[e],
      ayuda: AYUDA_ETAPA[e],
      valor: hayMonto(suma) ? `${e === "cerrado" ? "Cerrado en" : "En juego"}: ${plataMontos(suma)}` : null,
      tarjetas: lista.map((c) => ({
        id: c.id,
        nombre: c.nombre ?? telefonoBonito(c.telefono),
        ...colorEInicial(c.nombre, c.telefono),
        resumen: resumenBusca(c.busca ?? {}) || "Todavía no dijo qué busca",
        dias: dias(c),
        estancado: estancado(c),
        recordatorio: recordatorio(c),
        casa: casaDe.get(c.id) ?? null,
        // Para proponer el cierre: la oferta, la casa que le interesa o, si no, la última que fue a ver.
        cierre: (() => {
          const casaId = c.propiedad_interes_id ?? casaVistaDe.get(c.id) ?? null;
          const casa = casaId ? casasPorId.get(casaId) : undefined;
          const v = c.oferta_monto ? valorDe(c) : { monto: Number(casa?.precio ?? 0), moneda: monedaDe(casa?.moneda) };
          return { precio: v.monto || null, moneda: v.moneda, operacion: operacion(c) ?? casa?.operacion ?? null, casaId };
        })(),
      })),
    };
  });

  return (
    <>
      <header className="encabezado clientes-encabezado">
        <div>
          <h1>Clientes</h1>
          <p className="suave">{todos.length === 1 ? "1 cliente" : `${todos.length} clientes`}</p>
        </div>
        <div className="botones">
          <Link href="/panel/negocio" className="boton solo-computadora" data-patty="clientes-negocio">
            Cómo va el negocio
          </Link>
          <Link data-patty="clientes-agregar" href="/panel/clientes/nuevo" className="boton primario">
            <IconoAgregar tamano={20} /> Agregar
          </Link>
        </div>
      </header>

      {todos.length > 0 && (
        <div className="cifras embudo-cifras">
          <Link href="/panel/clientes" className="tarjeta cifra">
            <strong>{activos.length}</strong>
            <span className="suave">{activos.length === 1 ? "cliente activo" : "clientes activos"}</span>
          </Link>
          <Link href="/panel/clientes?etapa=negociando" className="tarjeta cifra">
            <strong>{hayMonto(enNegociacion) ? plataMontos(enNegociacion) : "—"}</strong>
            <span className="suave">
              en negociación{negociando.length ? ` (${negociando.length} ${negociando.length === 1 ? "cliente" : "clientes"})` : ""}
              {hayMonto(comisionPosible) ? ` · comisión posible ${plataMontos(comisionPosible)}` : ""}
            </span>
          </Link>
          <Link href="/panel/clientes?etapa=cerrado" className="tarjeta cifra">
            <strong>{hayMonto(ganadoMes) ? plataMontos(ganadoMes) : cerradosMes.length}</strong>
            <span className="suave">
              {hayMonto(ganadoMes)
                ? `ganado este mes (${cerradosMes.length} ${cerradosMes.length === 1 ? "cierre" : "cierres"})`
                : cerradosMes.length === 1
                  ? "cerró este mes"
                  : "cerraron este mes"}
            </span>
          </Link>
          <Link href="/panel/clientes?ver=atencion" className={`tarjeta cifra${atencion.length ? " alerta" : ""}`}>
            <strong>{atencion.length}</strong>
            <span className="suave">{atencion.length === 1 ? "necesita que lo llames" : "necesitan que los llames"}</span>
          </Link>
        </div>
      )}
      <Link href="/panel/negocio" className="ver-negocio solo-telefono">
        Ver cómo va el negocio ›
      </Link>
      {(deCadaDiez !== null || motivoPrincipal) && (
        <p className="suave embudo-nota">
          {deCadaDiez !== null && `De cada 10 clientes que terminan, ${deCadaDiez} ${deCadaDiez === 1 ? "cierra" : "cierran"}. `}
          {motivoPrincipal && `Cuando se pierden, casi siempre es porque: ${motivoPrincipal.toLowerCase()}.`}
        </p>
      )}

      <nav className="tipo-clientes" aria-label="Compras o alquileres">
        <Link href="/panel/clientes" aria-current={!tipo ? "page" : undefined}>
          Todos
        </Link>
        <Link href={`/panel/clientes?tipo=compras`} aria-current={tipo === "compras" ? "page" : undefined}>
          Compras
        </Link>
        <Link href={`/panel/clientes?tipo=alquileres`} aria-current={tipo === "alquileres" ? "page" : undefined}>
          Alquileres
        </Link>
      </nav>

      <form className="buscar-clientes" role="search">
        {elegida && <input type="hidden" name="etapa" value={elegida} />}
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <input data-patty="clientes-buscar" type="search" name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre o teléfono" aria-label="Buscar por nombre o teléfono" />
      </form>

      <nav className="filtro-etapas" aria-label="Etapas">
        <Link href={enlace({})} aria-current={!elegida && !verAtencion ? "page" : undefined}>
          Activos <span>{clientes.filter(activo).length}</span>
        </Link>
        {atencion.length > 0 && (
          <Link href={enlace({ ver: "atencion" })} aria-current={verAtencion ? "page" : undefined} className="filtro-atencion" data-patty="clientes-llamar">
            Llamar <span>{atencion.length}</span>
          </Link>
        )}
        {ETAPAS.map((e) => (
          <Link key={e} href={enlace({ etapa: e })} aria-current={elegida === e ? "page" : undefined}>
            {NOMBRE_ETAPA[e]} <span>{cuantos(e)}</span>
          </Link>
        ))}
      </nav>

      {error && (
        <p className="aviso">No se pudieron cargar los clientes. Avísale a soporte con este código: {error.code ?? "sin código"}.</p>
      )}
      {!error && todos.length === 0 && (
        <p className="vacio">Cuando un cliente te escriba por WhatsApp, aparece aquí. También puedes agregarlo tú.</p>
      )}
      {!error && todos.length > 0 && buscar && clientes.length === 0 && <p className="vacio">No hay ningún cliente con ese nombre o teléfono.</p>}
      {elegida && <p className="suave ayuda-etapa">{AYUDA_ETAPA[elegida]}</p>}
      {verAtencion && <p className="suave ayuda-etapa">Llevan días sin moverse o tienen un recordatorio para hoy.</p>}
      {(elegida || verAtencion) && visibles.length === 0 && <p className="vacio">Nadie por aquí.</p>}

      {/* Teléfono: lista */}
      <div className="clientes-lista">{visibles.map(tarjeta)}</div>
      {!elegida && !verAtencion && perdidos.length > 0 && (
        <p className="suave ayuda-etapa clientes-lista">
          Los que ya no siguen están en <Link href="/panel/clientes?etapa=perdido">Perdido</Link>.
        </p>
      )}

      {/* Computadora: tablero por etapa (o la lista, si se eligió una etapa o "Llamar") */}
      {elegida || verAtencion ? (
        <div className="lista-escritorio">{visibles.map(tarjeta)}</div>
      ) : (
        todos.length > 0 && <Tablero columnas={columnas} comisionPct={corredor.comision_pct ?? 5} />
      )}
    </>
  );
}
