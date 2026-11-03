import Link from "next/link";
import { fechaCorta } from "@/lib/formato";
import { ETAPAS, NOMBRE_ETAPA, resumenBusca, type Busca, type Etapa } from "@/lib/crm/perfil";
import { fechaIso, fechaLocal } from "@/lib/agenda/tiempo";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Avatar } from "../avatar";

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

export default async function Clientes({ searchParams }: { searchParams: Promise<{ etapa?: string }> }) {
  const { etapa: pedida } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("contactos")
    .select("id, nombre, telefono, etapa, busca, seguimiento_fecha, seguimiento_nota, updated_at")
    .eq("corredor_id", corredor.id)
    .eq("es_corredor", false)
    .order("updated_at", { ascending: false })
    .limit(300);
  const clientes = (data ?? []) as Cliente[];
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
          <strong>{c.nombre ?? c.telefono}</strong>
          <span className="suave">{resumen || "Todavía no dijo qué busca"}</span>
          {c.seguimiento_fecha && (
            <span className={`seguimiento${vence ? " vence" : ""}`}>
              {vence ? "Hoy: " : `${fechaCorta(c.seguimiento_fecha)}: `}
              {c.seguimiento_nota ?? "darle seguimiento"}
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
          <p className="suave">{clientes.length === 1 ? "1 cliente" : `${clientes.length} clientes`}</p>
        </div>
      </header>

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

      {clientes.length === 0 && <p className="vacio">Cuando un cliente te escriba por WhatsApp, aparece aquí.</p>}

      {/* Teléfono: lista */}
      <div className="clientes-lista">{visibles.map((c) => tarjeta(c))}</div>

      {/* Computadora: tablero por etapa */}
      <div className="tablero">
        {ETAPAS.filter((e) => e !== "perdido").map((e) => (
          <section key={e} className="tablero-columna">
            <h2>
              {NOMBRE_ETAPA[e]} <span>{cuantos(e)}</span>
            </h2>
            {clientes.filter((c) => c.etapa === e).map((c) => tarjeta(c, false))}
          </section>
        ))}
      </div>
    </>
  );
}
