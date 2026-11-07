import Link from "next/link";
import { fechaCorta } from "@/lib/formato";
import { AYUDA_ETAPA, ETAPAS, NOMBRE_ETAPA, resumenBusca, telefonoBonito, type Busca, type Etapa } from "@/lib/crm/perfil";
import { fechaIso, fechaLocal } from "@/lib/agenda/tiempo";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Avatar } from "../avatar";
import { IconoAgregar } from "../iconos";

// CRM: los clientes por etapa. En el teléfono, una lista con la etapa elegida arriba; en computadora,
// un tablero con una columna por etapa.

type Cliente = {
  id: string;
  nombre: string | null;
  telefono: string;
  etapa: Etapa;
  busca: Busca;
  seguimiento_fecha: string | null;
  seguimiento_nota: string | null;
  updated_at: string;
};

export default async function Clientes({ searchParams }: { searchParams: Promise<{ etapa?: string; q?: string }> }) {
  const { etapa: pedida, q } = await searchParams;
  const buscar = (q ?? "").trim().toLowerCase();
  const digitos = buscar.replace(/\D/g, "");
  const { supabase, corredor } = await sesionConCorredor();
  const { data, error } = await supabase
    .from("contactos")
    .select("id, nombre, telefono, etapa, busca, seguimiento_fecha, seguimiento_nota, updated_at")
    .eq("corredor_id", corredor.id)
    .eq("es_corredor", false)
    .order("updated_at", { ascending: false })
    .limit(300);
  const todos = (data ?? []) as Cliente[];
  // Buscar por nombre o por teléfono (con o sin espacios).
  const clientes = buscar
    ? todos.filter((c) => (c.nombre ?? "").toLowerCase().includes(buscar) || (digitos.length >= 3 && c.telefono.includes(digitos)))
    : todos;
  const hoy = fechaIso(fechaLocal(new Date(), corredor.zona_horaria));
  const elegida = (ETAPAS as readonly string[]).includes(pedida ?? "") ? (pedida as Etapa) : null;
  const visibles = elegida ? clientes.filter((c) => c.etapa === elegida) : clientes.filter((c) => c.etapa !== "perdido");
  const cuantos = (e: Etapa) => clientes.filter((c) => c.etapa === e).length;

  const tarjeta = (c: Cliente, conEtapa = !elegida) => {
    const resumen = resumenBusca(c.busca ?? {});
    const vence = c.seguimiento_fecha && c.seguimiento_fecha <= hoy;
    return (
      <Link key={c.id} href={`/panel/clientes/${c.id}`} className="cliente-tarjeta">
        <Avatar nombre={c.nombre} telefono={c.telefono} />
        <span className="cliente-texto">
          <strong>{c.nombre ?? telefonoBonito(c.telefono)}</strong>
          <span className="suave">{resumen || "Todavía no dijo qué busca"}</span>
          {c.seguimiento_fecha && (
            <span className={`seguimiento${vence ? " vence" : ""}`}>
              {vence ? "Hoy: " : `${fechaCorta(c.seguimiento_fecha)}: `}
              {c.seguimiento_nota ?? "escribirle"}
            </span>
          )}
        </span>
        {conEtapa && <span className={`etapa etapa-${c.etapa}`}>{NOMBRE_ETAPA[c.etapa]}</span>}
      </Link>
    );
  };

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

      <form className="buscar-clientes" role="search">
        {elegida && <input type="hidden" name="etapa" value={elegida} />}
        <input type="search" name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre o teléfono" aria-label="Buscar por nombre o teléfono" />
      </form>

      <nav className="filtro-etapas" aria-label="Etapas">
        <Link href="/panel/clientes" aria-current={!elegida ? "page" : undefined}>
          Todos
        </Link>
        {ETAPAS.map((e) => (
          <Link key={e} href={`/panel/clientes?etapa=${e}`} aria-current={elegida === e ? "page" : undefined}>
            {NOMBRE_ETAPA[e]} <span>{cuantos(e)}</span>
          </Link>
        ))}
      </nav>

      {error && (
        <p className="aviso">
          No se pudieron cargar los clientes. Avísale a soporte con este código: {error.code ?? "sin código"}.
        </p>
      )}
      {!error && todos.length === 0 && <p className="vacio">Cuando un cliente te escriba por WhatsApp, aparece aquí. También puedes agregarlo tú.</p>}
      {!error && todos.length > 0 && clientes.length === 0 && <p className="vacio">No hay ningún cliente con ese nombre o teléfono.</p>}
      {elegida && <p className="suave ayuda-etapa">{AYUDA_ETAPA[elegida]}</p>}

      {/* Teléfono: lista */}
      <div className="clientes-lista">{visibles.map((c) => tarjeta(c))}</div>
      {!elegida && cuantos("perdido") > 0 && (
        <p className="suave ayuda-etapa">
          Los que ya no siguen están en <Link href="/panel/clientes?etapa=perdido">Perdido</Link>.
        </p>
      )}

      {/* Computadora: tablero por etapa */}
      <div className="tablero">
        {ETAPAS.filter((e) => e !== "perdido").map((e) => (
          <section key={e} className="tablero-columna">
            <h2>
              {NOMBRE_ETAPA[e]} <span>{cuantos(e)}</span>
            </h2>
            <p className="suave">{AYUDA_ETAPA[e]}</p>
            {clientes.filter((c) => c.etapa === e).map((c) => tarjeta(c, false))}
          </section>
        ))}
      </div>
    </>
  );
}
