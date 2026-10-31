import Link from "next/link";
import { fechaCorta, precio } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { marcarLead } from "../acciones";
import { desconectarExtension } from "./acciones";
import { ConectarExtension } from "./conectar-extension";

type Lead = {
  id: string;
  url: string;
  titulo: string | null;
  zona: string | null;
  precio: number | null;
  moneda: string | null;
  puntaje: number | null;
  senales: string[];
  estado_contacto: string;
  semana: string;
};

const ESTADO: Record<string, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  respondio: "Respondió",
  captado: "Captado",
  descartado: "Descartado",
};

export default async function Duenos() {
  const { supabase, corredor } = await sesionConCorredor();
  const [{ data }, { data: conexiones }] = await Promise.all([
    supabase
    .from("leads_duenos")
    .select("id, url, titulo, zona, precio, moneda, puntaje, senales, estado_contacto, semana")
    .eq("es_dueno", true)
    .neq("estado_contacto", "descartado")
    .order("semana", { ascending: false })
    .order("puntaje", { ascending: false })
    .limit(90),
    supabase
      .from("extension_conexiones")
      .select("conectada_at, ultimo_uso_at")
      .eq("corredor_id", corredor.id)
      .not("conectada_at", "is", null)
      .is("revocada_at", null)
      .order("conectada_at", { ascending: false })
      .limit(1),
  ]);
  const conexion = conexiones?.[0] as { conectada_at: string; ultimo_uso_at: string | null } | undefined;
  const leads = (data ?? []) as Lead[];
  const semanas = [...new Set(leads.map((l) => l.semana))];

  return (
    <>
      <header className="encabezado">
        <h1>Dueños directos</h1>
        <Link href="/panel/duenos/corredores" className="boton">
          Corredores
        </Link>
      </header>
      <p className="suave">
        Lista semanal de Encuentra24. Escríbeles desde el botón de WhatsApp del anuncio; la asistente nunca les
        escribe.
      </p>
      <section className="tarjeta pila">
        <h2>Buscar desde Chrome</h2>
        {corredor.activo === false ? (
          <p className="suave">En la demo no se conecta la extensión: en una cuenta real, aquí la conectas.</p>
        ) : conexion ? (
          <>
            <p>
              Tu extensión está conectada
              {conexion.ultimo_uso_at ? ` (la usaste el ${fechaCorta(conexion.ultimo_uso_at.slice(0, 10))})` : ""}. Ábrela en
              Chrome y toca <strong>Buscar dueños</strong> una vez por semana.
            </p>
            <form action={desconectarExtension}>
              <button type="submit">Desconectar la extensión</button>
            </form>
          </>
        ) : (
          <>
            <p>
              La búsqueda corre en tu Chrome: la extensión abre Encuentra24 en una pestaña y aquí aparecen los dueños.{" "}
              <Link href="/panel/duenos/extension">Cómo instalarla</Link>.
            </p>
            <ConectarExtension />
          </>
        )}
      </section>

      {leads.length === 0 && <p className="vacio">Todavía no hay dueños directos.</p>}
      {semanas.map((semana) => (
        <section key={semana} className="semana-duenos">
          <h2>Semana del {fechaCorta(semana)}</h2>
          {leads
            .filter((l) => l.semana === semana)
            .map((l) => (
              <article key={l.id} className="tarjeta pila">
                <div className="fila">
                  <strong>{l.titulo ?? "Casa"}</strong>
                  <span className="insignia dorada">{l.puntaje ?? "—"}/100</span>
                </div>
                <p className="suave">
                  {[l.zona, l.precio ? precio(l.precio, l.moneda) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {l.senales.length > 0 && <p className="suave">{l.senales.join(" · ")}</p>}
                <div className="fila">
                  <a href={l.url} target="_blank" rel="noreferrer" className="boton primario">
                    Ver anuncio
                  </a>
                  <span className="insignia">{ESTADO[l.estado_contacto] ?? l.estado_contacto}</span>
                </div>
                <form action={marcarLead} className="botones">
                  <input type="hidden" name="lead" value={l.id} />
                  <button type="submit" name="estado" value="contactado">
                    Contactado
                  </button>
                  <button type="submit" name="estado" value="captado">
                    Captado
                  </button>
                  <button type="submit" name="estado" value="corredor" className="peligro">
                    Es corredor
                  </button>
                  <button type="submit" name="estado" value="descartado">
                    Descartar
                  </button>
                </form>
              </article>
            ))}
        </section>
      ))}
    </>
  );
}
