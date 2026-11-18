import Link from "next/link";
import manifiesto from "@/extension/manifest.json";
import { precio } from "@/lib/formato";
import { leerSenales } from "@/lib/encuentra24/senales";
import { accionesDueno, diasQuieto, embudoDuenos, ETAPAS_DUENO, etapaElegida, haceCuanto, mensajeParaDueno, razonesDueno } from "@/lib/panel/duenos";
import { duenosDeLaUltima } from "@/lib/panel/extension-hero";
import { energiaDelCorredor } from "@/lib/panel/energia";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../aviso";
import { IconoLlave } from "../iconos";
import { EncabezadoPagina, Vacio } from "../piezas";
import { marcarLead } from "../acciones";
import { crearMensajesDueno, desconectarExtension, pasarAMisCasas } from "./acciones";
import { EstadoExtensionDuenos } from "./estado-extension";
import { estadoDelServidor } from "./estado-servidor";
import { InstagramDueno, type MarcaTarjeta } from "./fotos-dueno";
import { MensajePatty } from "./mensaje-patty";
import { EmbudoDuenos, TarjetaDueno, type DuenoVista, type FormulariosDueno } from "./vistas";
import "./extension/extension.css";
import "./duenos.css";

// Dueños directos: arriba la extensión (cómo está y lo único que sigue, o la búsqueda en vivo), después el embudo de
// captación (Encontrados → Les escribí → Respondieron → Visité la casa → Firmaron → Publicadas) con cuántos llegan a
// cada etapa, y los dueños de la etapa elegida, cada uno con una acción principal. La asistente nunca les escribe:
// "Escribirle por WhatsApp" abre WhatsApp del corredor con un mensaje amable listo para que lo mande él.

type Lead = {
  id: string;
  url: string;
  titulo: string | null;
  zona: string | null;
  precio: number | null;
  moneda: string | null;
  puntaje: number | null;
  /** Razones y fotos (ver lib/encuentra24/senales.ts): se leen con leerSenales, nunca directo. */
  senales: unknown;
  foto_url: string | null;
  es_dueno: boolean | null;
  estado_contacto: string;
  estado_at: string | null;
  created_at: string;
  propiedad_id: string | null;
  telefono: string | null;
  nombre_anunciante: string | null;
};

const VACIO_ETAPA: Record<string, string> = {
  nuevo: "No hay dueños nuevos por escribir. La próxima búsqueda trae más.",
  contactado: "Cuando le escribas a un dueño, toca «Ya le escribí» y pasa aquí.",
  respondio: "Aquí llegan los dueños que te contestaron.",
  visitada: "Aquí van las casas que ya fuiste a ver.",
  captado: "Cuando un dueño firme contigo, aparece aquí para pasarlo a Mis casas.",
  publicada: "Las casas de dueños que ya están en Mis casas.",
};

export default async function Duenos({ searchParams }: { searchParams: Promise<{ etapa?: string; aviso?: string }> }) {
  const { etapa: pedida, aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const [{ data }, extension, energia] = await Promise.all([
    supabase
      .from("leads_duenos")
      .select("id, url, titulo, zona, precio, moneda, puntaje, senales, foto_url, es_dueno, estado_contacto, estado_at, created_at, propiedad_id, telefono, nombre_anunciante")
      .eq("corredor_id", corredor.id)
      .eq("es_dueno", true)
      .neq("estado_contacto", "descartado")
      .order("puntaje", { ascending: false })
      .limit(300),
    estadoDelServidor({ supabase, corredor }),
    corredor.activo === false ? Promise.resolve(null) : energiaDelCorredor(corredor.id),
  ]);
  const leads = (data ?? []) as Lead[];
  const embudo = embudoDuenos(leads.map((l) => l.estado_contacto));
  const elegida = etapaElegida(pedida, embudo);
  const etapa = ETAPAS_DUENO.find((e) => e.clave === elegida)!;
  const visibles = leads.filter((l) => l.estado_contacto === elegida);
  const ahora = Date.now();
  const asistente = corredor.nombre_asistente || "Patty";
  const marca = await marcaTarjeta(supabase, corredor);

  const formularios: FormulariosDueno = {
    etapa: (d, estado, texto, principal) => (
      <form action={marcarLead}>
        <input type="hidden" name="lead" value={d.id} />
        <input type="hidden" name="volver" value={elegida} />
        <button type="submit" name="estado" value={estado} className={principal ? "primario" : undefined}>
          {texto}
        </button>
      </form>
    ),
    misCasas: (d) => (
      <form action={pasarAMisCasas}>
        <input type="hidden" name="lead" value={d.id} />
        <button type="submit" className="primario">
          Pasarla a Mis casas
        </button>
      </form>
    ),
    patty: (d, principal) => {
      const l = leads.find((x) => x.id === d.id);
      return <MensajePatty leadId={d.id} asistente={asistente} telefono={l?.telefono ?? null} url={d.url} principal={principal} pedir={crearMensajesDueno} />;
    },
    descartar: (d) => (
      <form action={marcarLead} className="dd-mas-botones">
        <input type="hidden" name="lead" value={d.id} />
        <input type="hidden" name="volver" value={elegida} />
        <button type="submit" name="estado" value="corredor" className="peligro">
          Es corredor
        </button>
        <button type="submit" name="estado" value="descartado">
          Ya no me interesa
        </button>
      </form>
    ),
  };

  return (
    <div className="dd-pagina">
      <EncabezadoPagina
        titulo="Dueños directos"
        apoyo="Casas que venden sus dueños en Encuentra24. Les escribes tú."
        atras={{ href: "/panel/mas", texto: "Más", soloTelefono: true }}
      >
        <Link href="/panel/duenos/corredores" className="boton" data-patty="duenos-corredores">
          Corredores conocidos
        </Link>
      </EncabezadoPagina>
      <Aviso texto={aviso} />

      <EstadoExtensionDuenos
        servidor={{ conectada: extension.conectada, ultimaBusquedaDias: extension.ultimaBusquedaDias }}
        version={manifiesto.version}
        demo={extension.demo}
        corredor={extension.corredor}
        asistente={extension.asistente}
        ultima={{ en: extension.ultimaBusqueda, duenos: duenosDeLaUltima(leads.map((l) => l.created_at), extension.ultimaBusqueda) }}
        energia={energia}
        ahora={ahora}
        desconectar={
          <form action={desconectarExtension}>
            <button type="submit" className="dd-enlace" data-patty="duenos-desconectar">
              Desconectar
            </button>
          </form>
        }
      />

      {leads.length === 0 ? (
        <Vacio
          Icono={IconoLlave}
          titulo="Todavía no hay dueños directos"
          accion={
            <a href="/panel/duenos/extension" className="boton">
              Ver cómo funciona
            </a>
          }
        >
          Cuando la extensión busque en Encuentra24, aquí aparecen las casas que venden sus dueños, con su precio y zona. Les escribes tú, con un toque.
        </Vacio>
      ) : (
        <>
          <h2 className="dd-titulo">Tu embudo de captación</h2>
          <EmbudoDuenos pasos={embudo} elegida={elegida} />
          <p className="dd-ayuda-etapa">
            <strong>{etapa.nombre}:</strong> {etapa.ayuda}
          </p>
          {visibles.length === 0 ? (
            <Vacio Icono={IconoLlave} compacto>
              {VACIO_ETAPA[elegida]}
            </Vacio>
          ) : (
            <div className="dd-lista">
              {visibles.map((l) => {
                const senales = leerSenales(l.senales, l.foto_url);
                const d: DuenoVista = {
                  id: l.id,
                  url: l.url,
                  titulo: l.titulo,
                  zona: l.zona,
                  precio: l.precio ? precio(l.precio, l.moneda) : null,
                  puntaje: l.puntaje,
                  esDueno: l.es_dueno !== false,
                  razones: razonesDueno(senales.razones),
                  fotos: senales.fotos,
                  cuando: elegida === "nuevo" ? `Encontrado ${haceCuanto(l.created_at, ahora) ?? ""}`.trim() : (haceCuanto(l.estado_at, ahora) ?? null),
                  quieto: diasQuieto(l.estado_at, ahora),
                  nombre: l.nombre_anunciante,
                };
                const mensaje = mensajeParaDueno({ nombre: l.nombre_anunciante, titulo: l.titulo, zona: l.zona, corredor: corredor.nombre });
                const { principal, segunda } = accionesDueno(elegida, { url: l.url, telefono: l.telefono, propiedadId: l.propiedad_id, mensaje });
                const instagram = d.fotos[0] ? <InstagramDueno foto={d.fotos[0]} marca={marca} precio={d.precio} zona={d.zona} /> : null;
                return <TarjetaDueno key={l.id} d={d} etapa={elegida} principal={principal} segunda={segunda} formularios={formularios} instagram={instagram} />;
              })}
            </div>
          )}
        </>
      )}

      <details className="dd-como">
        <summary>¿Cómo busca los dueños?</summary>
        <p>
          La extensión abre Encuentra24 en una pestaña de tu Chrome, lee los anuncios de tus zonas y aquí aparecen los dueños. Busca a tu ritmo, como lo
          harías tú: lee cada página, hace pausas y no abre más de una pestaña. Si Encuentra24 te pide confirmar que eres tú, se detiene y te avisa.
        </p>
        <p>
          Busca sola una vez por semana mientras Chrome esté abierto. La puedes pausar o detener desde la pestaña, el panel de la extensión o aquí. Los
          anuncios de <Link href="/panel/duenos/corredores">corredores conocidos</Link> no aparecen.{" "}
          <a href="/panel/duenos/extension">Ver la instalación paso a paso</a>.
        </p>
      </details>
    </div>
  );
}

/** Nombre, colores y logo del corredor para la vista de Instagram (como la lámina de Patty). */
async function marcaTarjeta(
  supabase: Awaited<ReturnType<typeof sesionConCorredor>>["supabase"],
  corredor: Awaited<ReturnType<typeof sesionConCorredor>>["corredor"],
): Promise<MarcaTarjeta> {
  const marca = corredor.marca ?? null;
  let logo: string | null = null;
  const archivo = marca?.logoSobreProfundo ?? null;
  if (archivo && /^https:\/\//.test(archivo)) logo = archivo;
  else if (archivo) {
    const { data } = await supabase.from("corredores").select("slug").eq("id", corredor.id).maybeSingle();
    if (data?.slug) logo = `/marca/${data.slug as string}/logo`;
  }
  return {
    nombre: marca?.nombre ?? corredor.nombre,
    logo,
    colores: marca?.colores ?? { principal: "#008069", profundo: "#111b21", base: "#ffffff" },
  };
}
