import Link from "next/link";
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
};

const DIA = 24 * 60 * 60_000;
// Días sin movimiento a partir de los cuales un cliente "necesita atención", por etapa.
const ESTANCADO: Partial<Record<Etapa, number>> = { nuevo: 2, interesado: 7, visita: 5, negociando: 7 };

/** "$1,2 millones" o "$850 mil": cifras redondas, fáciles de leer. */
function plata(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} ${n >= 2_000_000 ? "millones" : "millón"}`;
  if (n >= 1000) return `$${Math.round(n / 1000)} mil`;
  return `$${Math.round(n)}`;
}

export default async function Clientes({ searchParams }: { searchParams: Promise<{ etapa?: string; q?: string; ver?: string }> }) {
  const { etapa: pedida, q, ver } = await searchParams;
  const buscar = (q ?? "").trim().toLowerCase();
  const digitos = buscar.replace(/\D/g, "");
  const { supabase, corredor } = await sesionConCorredor();
  const [{ data, error }, { data: citasData }] = await Promise.all([
    supabase
      .from("contactos")
      .select("id, nombre, telefono, etapa, etapa_at, busca, seguimiento_fecha, seguimiento_nota, motivo_perdida, updated_at")
      .eq("corredor_id", corredor.id)
      .eq("es_corredor", false)
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("citas")
      .select("contacto_id, inicio, propiedades(titulo)")
      .eq("corredor_id", corredor.id)
      .order("inicio", { ascending: false })
      .limit(500),
  ]);
  const todos = (data ?? []) as Cliente[];
  // La última casa que fue (o va) a ver cada cliente.
  const casaDe = new Map<string, string>();
  for (const c of (citasData ?? []) as { contacto_id: string; propiedades: { titulo: string } | { titulo: string }[] | null }[]) {
    const p = Array.isArray(c.propiedades) ? c.propiedades[0] : c.propiedades;
    if (p && !casaDe.has(c.contacto_id)) casaDe.set(c.contacto_id, p.titulo);
  }

  const ahora = Date.now();
  const hoy = fechaIso(fechaLocal(new Date(), corredor.zona_horaria));
  const mes = hoy.slice(0, 7);
  const dias = (c: Cliente) => Math.max(0, Math.floor((ahora - Date.parse(c.etapa_at)) / DIA));
  const activo = (c: Cliente) => c.etapa !== "cerrado" && c.etapa !== "perdido";
  // Necesita atención: lleva mucho en su etapa y no tiene un recordatorio a futuro.
  const estancado = (c: Cliente) =>
    activo(c) && dias(c) >= (ESTANCADO[c.etapa] ?? 99) && !(c.seguimiento_fecha && c.seguimiento_fecha > hoy);
  const vence = (c: Cliente) => !!c.seguimiento_fecha && c.seguimiento_fecha <= hoy;

  const activos = todos.filter(activo);
  const enJuego = activos
    .filter((c) => c.busca?.operacion !== "alquiler" && (c.busca?.moneda ?? "USD") === "USD" && c.busca?.presupuesto_max)
    .reduce((s, c) => s + (c.busca.presupuesto_max ?? 0), 0);
  const cerradosMes = todos.filter((c) => c.etapa === "cerrado" && c.etapa_at.slice(0, 7) === mes).length;
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
    estancado(c) ? `Sin movimiento hace ${dias(c)} días` : dias(c) === 0 ? "Llegó a esta etapa hoy" : `En esta etapa hace ${dias(c)} ${dias(c) === 1 ? "día" : "días"}`;

  const tarjeta = (c: Cliente) => {
    const r = recordatorio(c);
    return (
      <Link key={c.id} href={`/panel/clientes/${c.id}`} className="cliente-tarjeta">
        <Avatar nombre={c.nombre} telefono={c.telefono} />
        <span className="cliente-texto">
          <strong>{c.nombre ?? telefonoBonito(c.telefono)}</strong>
          <span className="suave">{resumenBusca(c.busca ?? {}) || "Todavía no dijo qué busca"}</span>
          {casaDe.get(c.id) && <span className="suave">Le interesa: {casaDe.get(c.id)}</span>}
          {r && <span className={`seguimiento${r.vence ? " vence" : ""}`}>{r.texto}</span>}
          {c.etapa === "perdido" && c.motivo_perdida && <span className="suave">{c.motivo_perdida}</span>}
          {activo(c) && <span className={`dias-etapa${estancado(c) ? " estancado" : ""}`}>{textoDias(c)}</span>}
        </span>
        {!elegida && <span className={`etapa etapa-${c.etapa}`}>{NOMBRE_ETAPA[c.etapa]}</span>}
      </Link>
    );
  };

  // Tablero de la computadora: valor por columna (compras en dólares) y tarjetas listas para arrastrar.
  const columnas: ColumnaTablero[] = ETAPAS.filter((e) => e !== "perdido").map((e) => {
    const lista = clientes.filter((c) => c.etapa === e);
    const suma = lista
      .filter((c) => c.busca?.operacion !== "alquiler" && (c.busca?.moneda ?? "USD") === "USD")
      .reduce((s, c) => s + (c.busca?.presupuesto_max ?? 0), 0);
    return {
      etapa: e,
      nombre: NOMBRE_ETAPA[e],
      ayuda: AYUDA_ETAPA[e],
      valor: suma > 0 ? `Compras hasta ${plata(suma)}` : null,
      tarjetas: lista.map((c) => ({
        id: c.id,
        nombre: c.nombre ?? telefonoBonito(c.telefono),
        ...colorEInicial(c.nombre, c.telefono),
        resumen: resumenBusca(c.busca ?? {}) || "Todavía no dijo qué busca",
        dias: dias(c),
        estancado: estancado(c),
        recordatorio: recordatorio(c),
        casa: casaDe.get(c.id) ?? null,
      })),
    };
  });

  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Clientes</h1>
          <p className="suave">{todos.length === 1 ? "1 cliente" : `${todos.length} clientes`}</p>
        </div>
        <Link href="/panel/clientes/nuevo" className="boton primario">
          <IconoAgregar tamano={20} /> Agregar
        </Link>
      </header>

      {todos.length > 0 && (
        <div className="cifras embudo-cifras">
          <Link href="/panel/clientes" className="tarjeta cifra">
            <strong>{activos.length}</strong>
            <span className="suave">{activos.length === 1 ? "cliente activo" : "clientes activos"}</span>
          </Link>
          <div className="tarjeta cifra">
            <strong>{enJuego > 0 ? plata(enJuego) : "—"}</strong>
            <span className="suave">en compras que se están moviendo</span>
          </div>
          <Link href="/panel/clientes?etapa=cerrado" className="tarjeta cifra">
            <strong>{cerradosMes}</strong>
            <span className="suave">{cerradosMes === 1 ? "cerró este mes" : "cerraron este mes"}</span>
          </Link>
          <Link href="/panel/clientes?ver=atencion" className={`tarjeta cifra${atencion.length ? " alerta" : ""}`}>
            <strong>{atencion.length}</strong>
            <span className="suave">{atencion.length === 1 ? "necesita que lo llames" : "necesitan que los llames"}</span>
          </Link>
        </div>
      )}
      {(deCadaDiez !== null || motivoPrincipal) && (
        <p className="suave embudo-nota">
          {deCadaDiez !== null && `De cada 10 clientes que terminan, ${deCadaDiez} ${deCadaDiez === 1 ? "cierra" : "cierran"}. `}
          {motivoPrincipal && `Cuando se pierden, casi siempre es porque: ${motivoPrincipal.toLowerCase()}.`}
        </p>
      )}

      <form className="buscar-clientes" role="search">
        {elegida && <input type="hidden" name="etapa" value={elegida} />}
        <input type="search" name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre o teléfono" aria-label="Buscar por nombre o teléfono" />
      </form>

      <nav className="filtro-etapas" aria-label="Etapas">
        <Link href="/panel/clientes" aria-current={!elegida && !verAtencion ? "page" : undefined}>
          Activos <span>{clientes.filter(activo).length}</span>
        </Link>
        {atencion.length > 0 && (
          <Link href="/panel/clientes?ver=atencion" aria-current={verAtencion ? "page" : undefined} className="filtro-atencion">
            Llamar <span>{atencion.length}</span>
          </Link>
        )}
        {ETAPAS.map((e) => (
          <Link key={e} href={`/panel/clientes?etapa=${e}`} aria-current={elegida === e ? "page" : undefined}>
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
        todos.length > 0 && <Tablero columnas={columnas} />
      )}
    </>
  );
}
