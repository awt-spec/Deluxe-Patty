import { fechaCorta, precio } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { marcarLead } from "../acciones";

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
  const { supabase } = await sesionConCorredor();
  const { data } = await supabase
    .from("leads_duenos")
    .select("id, url, titulo, zona, precio, moneda, puntaje, senales, estado_contacto, semana")
    .eq("es_dueno", true)
    .neq("estado_contacto", "descartado")
    .order("semana", { ascending: false })
    .order("puntaje", { ascending: false })
    .limit(90);
  const leads = (data ?? []) as Lead[];
  const semanas = [...new Set(leads.map((l) => l.semana))];

  return (
    <>
      <header className="encabezado">
        <h1>Dueños directos</h1>
      </header>
      <p className="suave">
        Lista semanal de Encuentra24. Escríbeles desde el botón de WhatsApp del anuncio; la asistente nunca les
        escribe.
      </p>
      {leads.length === 0 && <p className="vacio">Todavía no hay dueños directos. La búsqueda corre los lunes.</p>}
      {semanas.map((semana) => (
        <section key={semana}>
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
