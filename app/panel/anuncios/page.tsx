import Link from "next/link";
import { enlaceWhatsApp } from "@/lib/anuncios/atribucion";
import { DIAS_REPORTE } from "@/lib/anuncios/reporte";
import { crearRepositorioSupabase } from "@/lib/datos/repositorio";
import { fechaCorta } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../aviso";

type Texto = {
  es?: { titulo: string; descripcion: string };
  en?: { titulo: string; descripcion: string };
  sugerencias?: string[];
};

const ESTADO: Record<string, string> = {
  borrador: "Por publicar",
  activo: "Publicado",
  vencido: "Vencido",
  pausado: "Pausado",
};

export default async function Anuncios({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const desde = new Date(Date.now() - DIAS_REPORTE * 24 * 60 * 60_000);
  const anuncios = (await crearRepositorioSupabase(supabase).reporteAnuncios(corredor.id, desde)).sort(
    (a, b) => b.contactos_periodo - a.contactos_periodo,
  );
  const hoy = new Date().toISOString().slice(0, 10);
  // Texto preparado de los que faltan por publicar, para copiarlo a Encuentra24.
  const { data: borradores } = await supabase
    .from("anuncios_e24")
    .select("id, texto_preparado")
    .eq("corredor_id", corredor.id)
    .eq("estado", "borrador");
  const textos = new Map((borradores ?? []).map((b) => [b.id as string, (b.texto_preparado ?? {}) as Texto]));
  const conEnlace = (t: { titulo: string; descripcion: string }, referencia: string, invitacion: string) =>
    `${t.titulo}\n\n${t.descripcion}${
      corredor.whatsapp_numero ? `\n\n${invitacion}: ${enlaceWhatsApp(corredor.whatsapp_numero, referencia)}` : ""
    }`;

  return (
    <>
      <header className="encabezado">
        <h1>Anuncios</h1>
      </header>
      <Aviso texto={aviso} />
      <p className="suave">
        Contactos que llegaron por el enlace de WhatsApp de cada anuncio en los últimos {DIAS_REPORTE} días. Para preparar
        uno nuevo, abre la propiedad en <Link href="/panel/propiedades">Propiedades</Link> y toca “Preparar anuncio”.
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
            {a.estado === "borrador" && textos.get(a.id)?.es && (
              <details>
                <summary>Texto para publicar (ref. {a.referencia})</summary>
                <div className="pila">
                  <label htmlFor={`es-${a.id}`}>Español: la primera línea es el título</label>
                  <textarea
                    id={`es-${a.id}`}
                    readOnly
                    rows={10}
                    defaultValue={conEnlace(textos.get(a.id)!.es!, a.referencia, "Escríbeme por WhatsApp")}
                  />
                  {textos.get(a.id)!.en && (
                    <>
                      <label htmlFor={`en-${a.id}`}>Inglés</label>
                      <textarea
                        id={`en-${a.id}`}
                        readOnly
                        rows={10}
                        defaultValue={conEnlace(textos.get(a.id)!.en!, a.referencia, "Message me on WhatsApp")}
                      />
                    </>
                  )}
                  {(textos.get(a.id)!.sugerencias ?? []).length > 0 && (
                    <ul className="suave">
                      {textos.get(a.id)!.sugerencias!.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
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
