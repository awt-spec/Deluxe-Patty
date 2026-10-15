import { DIAS_REPORTE } from "@/lib/anuncios/reporte";
import { crearRepositorioSupabase } from "@/lib/datos/repositorio";
import { fechaCorta } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";

const ESTADO: Record<string, string> = {
  borrador: "Por publicar",
  activo: "Publicado",
  vencido: "Vencido",
  pausado: "Pausado",
};

export default async function Anuncios() {
  const { supabase, corredor } = await sesionConCorredor();
  const desde = new Date(Date.now() - DIAS_REPORTE * 24 * 60 * 60_000);
  const anuncios = (await crearRepositorioSupabase(supabase).reporteAnuncios(corredor.id, desde)).sort(
    (a, b) => b.contactos_periodo - a.contactos_periodo,
  );
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <header className="encabezado">
        <h1>Anuncios</h1>
      </header>
      <p className="suave">
        Contactos que llegaron por el enlace de WhatsApp de cada anuncio en los últimos {DIAS_REPORTE} días. Para preparar
        uno nuevo, escríbele a la asistente “anuncio” y el código de la propiedad.
      </p>
      {anuncios.length === 0 && <p className="vacio">Todavía no hay anuncios.</p>}
      {anuncios.map((a) => {
        const vence = a.vence_en && a.estado === "activo" ? a.vence_en : null;
        const pronto = vence !== null && vence <= new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
        return (
          <article key={a.id} className="tarjeta pila">
            <div className="fila">
              <strong>{a.titulo ?? a.propiedad_titulo ?? `ref. ${a.referencia}`}</strong>
              <span className="insignia">{ESTADO[a.estado] ?? a.estado}</span>
            </div>
            <div className="fila">
              <span>
                <strong>{a.contactos_periodo}</strong> <span className="suave">contactos · {a.contactos_total} en total</span>
              </span>
              {vence && <span className={`insignia ${pronto ? "alerta" : ""}`}>{vence < hoy ? "vencido" : `vence el ${fechaCorta(vence)}`}</span>}
            </div>
            {a.estado === "activo" && a.contactos_periodo === 0 && (
              <p className="suave">Sin contactos: revisa foto principal, título o precio.</p>
            )}
            {a.url && (
              <a href={a.url} target="_blank" rel="noreferrer" className="suave">
                Ver en Encuentra24
              </a>
            )}
          </article>
        );
      })}
    </>
  );
}
