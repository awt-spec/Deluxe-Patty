import Link from "next/link";
import { etiquetaHorario } from "@/lib/agenda/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../aviso";

type Fila = {
  id: string;
  estado: "abierta" | "escalada" | "cerrada";
  control: "asistente" | "corredor";
  ultimo_mensaje_cliente_at: string | null;
  updated_at: string;
  contactos: { nombre: string | null; telefono: string } | { nombre: string | null; telefono: string }[];
};

const FILTROS = [
  { clave: "aprobar", nombre: "Por aprobar" },
  { clave: "esperan", nombre: "Te esperan" },
  { clave: "todas", nombre: "Todas" },
];

export default async function Conversaciones({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; aviso?: string }>;
}) {
  const { filtro = "todas", aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();

  const [convs, borradores] = await Promise.all([
    supabase
      .from("conversaciones")
      .select("id, estado, control, ultimo_mensaje_cliente_at, updated_at, contactos!inner(nombre, telefono, es_corredor)")
      .eq("contactos.es_corredor", false)
      .neq("estado", "cerrada")
      .order("updated_at", { ascending: false })
      .limit(80),
    supabase.from("mensajes").select("conversacion_id").eq("estado_borrador", "pendiente"),
  ]);
  const pendientes = new Map<string, number>();
  for (const b of borradores.data ?? []) {
    const id = b.conversacion_id as string;
    pendientes.set(id, (pendientes.get(id) ?? 0) + 1);
  }
  let filas = (convs.data ?? []) as Fila[];
  if (filtro === "aprobar") filas = filas.filter((c) => pendientes.has(c.id));
  if (filtro === "esperan") filas = filas.filter((c) => c.estado === "escalada");

  return (
    <>
      <header className="encabezado">
        <h1>Conversaciones</h1>
      </header>
      <Aviso texto={aviso} />
      <nav className="pestanas" aria-label="Filtro">
        {FILTROS.map((f) => (
          <Link key={f.clave} href={`?filtro=${f.clave}`} aria-current={filtro === f.clave ? "page" : undefined}>
            {f.nombre}
          </Link>
        ))}
      </nav>
      {filas.length === 0 ? (
        <p className="vacio">Nada por aquí.</p>
      ) : (
        <ul className="lista-enlaces">
          {filas.map((c) => {
            const contacto = Array.isArray(c.contactos) ? c.contactos[0] : c.contactos;
            const n = pendientes.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Link href={`/panel/conversaciones/${c.id}`} className="tarjeta fila">
                  <div>
                    <strong>{contacto?.nombre ?? contacto?.telefono}</strong>
                    <p className="suave">
                      {c.ultimo_mensaje_cliente_at
                        ? etiquetaHorario(new Date(c.ultimo_mensaje_cliente_at), corredor.zona_horaria)
                        : "Sin mensajes del cliente"}
                    </p>
                  </div>
                  <div className="pila" style={{ alignItems: "flex-end" }}>
                    {n > 0 && <span className="insignia dorada">{n} por aprobar</span>}
                    {c.estado === "escalada" && <span className="insignia alerta">Te espera</span>}
                    {c.control === "corredor" && <span className="insignia">La llevas tú</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
