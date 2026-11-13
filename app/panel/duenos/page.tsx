import Link from "next/link";
import { fechaCorta, precio } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../aviso";
import { IconoCasa, IconoChats, IconoCheck, IconoLlave } from "../iconos";
import { Cifra, EncabezadoPagina, Vacio } from "../piezas";
import { marcarLead } from "../acciones";
import { desconectarExtension, pasarAMisCasas } from "./acciones";
import { ConectarExtension } from "./conectar-extension";

// Dueños directos como embudo de captación: Encontrado → Le escribí → Respondió → Visité la casa →
// Firmó conmigo → Publicada. Cada dueño tiene su siguiente paso con un botón; al firmar, la casa pasa a
// Mis casas con lo que se sabe del anuncio.

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
  estado_at: string | null;
  semana: string;
  propiedad_id: string | null;
};

const ETAPAS_DUENO = [
  { clave: "nuevo", nombre: "Encontrados", ayuda: "Todavía no les escribes", paso: "Ya le escribí", siguiente: "contactado" },
  { clave: "contactado", nombre: "Les escribí", ayuda: "Esperando que respondan", paso: "Respondió", siguiente: "respondio" },
  { clave: "respondio", nombre: "Respondieron", ayuda: "Coordina ir a ver la casa", paso: "Ya vi la casa", siguiente: "visitada" },
  { clave: "visitada", nombre: "Visité la casa", ayuda: "Propón vender con ella", paso: "Firmó conmigo", siguiente: "captado" },
  { clave: "captado", nombre: "Firmaron", ayuda: "Pásala a Mis casas para publicarla", paso: null, siguiente: null },
  { clave: "publicada", nombre: "Publicadas", ayuda: "Ya están en Mis casas", paso: null, siguiente: null },
] as const;

const DIA = 24 * 60 * 60_000;

export default async function Duenos({ searchParams }: { searchParams: Promise<{ etapa?: string; aviso?: string }> }) {
  const { etapa: pedida, aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const [{ data }, { data: conexiones }] = await Promise.all([
    supabase
      .from("leads_duenos")
      .select("id, url, titulo, zona, precio, moneda, puntaje, senales, estado_contacto, estado_at, semana, propiedad_id")
      .eq("corredor_id", corredor.id)
      .eq("es_dueno", true)
      .neq("estado_contacto", "descartado")
      .order("puntaje", { ascending: false })
      .limit(300),
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
  const cuantos = (e: string) => leads.filter((l) => l.estado_contacto === e).length;
  // Sin elegir, se abre la primera etapa que tenga dueños (lo que más pide atención).
  const elegida = ETAPAS_DUENO.find((e) => e.clave === pedida) ?? ETAPAS_DUENO.find((e) => cuantos(e.clave) > 0) ?? ETAPAS_DUENO[0];
  const visibles = leads.filter((l) => l.estado_contacto === elegida.clave);
  const ahora = Date.now();

  return (
    <>
      <EncabezadoPagina titulo="Dueños directos" apoyo="Casas que venden sus dueños en Encuentra24. Les escribes tú.">
        <Link href="/panel/duenos/corredores" className="boton">
          Corredores
        </Link>
      </EncabezadoPagina>
      <Aviso texto={aviso} />

      {leads.length > 0 && (
        <div className="cifras embudo-cifras">
          <Cifra Icono={IconoLlave} tono="verde" numero={cuantos("nuevo")}>
            por escribirles
          </Cifra>
          <Cifra Icono={IconoChats} tono="azul" numero={cuantos("contactado") + cuantos("respondio")}>
            en conversación
          </Cifra>
          <Cifra Icono={IconoCasa} tono="morado" numero={cuantos("visitada") + cuantos("captado")}>
            casas vistas o firmadas
          </Cifra>
          <Cifra Icono={IconoCheck} tono="ambar" numero={cuantos("publicada")}>
            {cuantos("publicada") === 1 ? "casa conseguida" : "casas conseguidas"}
          </Cifra>
        </div>
      )}

      <nav className="filtro-etapas" aria-label="Etapas de los dueños">
        {ETAPAS_DUENO.map((e) => (
          <Link key={e.clave} href={`/panel/duenos?etapa=${e.clave}`} aria-current={elegida.clave === e.clave ? "page" : undefined}>
            {e.nombre} <span>{cuantos(e.clave)}</span>
          </Link>
        ))}
      </nav>
      <p className="suave ayuda-etapa">{elegida.ayuda}</p>

      {leads.length === 0 && (
        <Vacio
          Icono={IconoLlave}
          titulo="Todavía no hay dueños directos."
          accion={
            <a href="#buscar-duenos" className="boton primario">
              Cómo buscarlos
            </a>
          }
        >
          Corre la búsqueda desde Chrome (abajo).
        </Vacio>
      )}
      {leads.length > 0 && visibles.length === 0 && (
        <Vacio Icono={IconoLlave} compacto>
          Nadie en esta etapa.
        </Vacio>
      )}

      <div className="duenos-lista">
        {visibles.map((l) => {
          const dias = l.estado_at ? Math.floor((ahora - Date.parse(l.estado_at)) / DIA) : null;
          return (
            <article key={l.id} className="tarjeta pila dueno">
              <div className="fila">
                <strong>{l.titulo ?? "Casa"}</strong>
                <span className="insignia dorada" title="Qué tan seguro es que sea el dueño">
                  {l.puntaje ?? "—"}/100
                </span>
              </div>
              <p className="suave">
                {[l.zona, l.precio ? precio(l.precio, l.moneda) : null, `encontrada la semana del ${fechaCorta(l.semana)}`].filter(Boolean).join(" · ")}
              </p>
              {l.senales.length > 0 && <p className="suave">{l.senales.join(" · ")}</p>}
              {dias !== null && dias >= 5 && elegida.clave !== "publicada" && (
                <p className="dias-etapa estancado">Sin movimiento hace {dias} días</p>
              )}
              <div className="botones">
                <a href={l.url} target="_blank" rel="noreferrer" className="boton">
                  Ver anuncio
                </a>
                {elegida.paso && (
                  <form action={marcarLead}>
                    <input type="hidden" name="lead" value={l.id} />
                    <input type="hidden" name="volver" value={elegida.clave} />
                    <button type="submit" name="estado" value={elegida.siguiente!} className="primario">
                      {elegida.paso}
                    </button>
                  </form>
                )}
                {elegida.clave === "captado" && (
                  <form action={pasarAMisCasas}>
                    <input type="hidden" name="lead" value={l.id} />
                    <button type="submit" className="primario">
                      Pasarla a Mis casas
                    </button>
                  </form>
                )}
                {elegida.clave === "publicada" && l.propiedad_id && (
                  <Link href={`/panel/propiedades/${l.propiedad_id}`} className="boton primario">
                    Ver en Mis casas
                  </Link>
                )}
              </div>
              {elegida.clave !== "publicada" && (
                <form action={marcarLead} className="botones dueno-otros">
                  <input type="hidden" name="lead" value={l.id} />
                  <input type="hidden" name="volver" value={elegida.clave} />
                  <button type="submit" name="estado" value="corredor" className="peligro">
                    Es corredor
                  </button>
                  <button type="submit" name="estado" value="descartado">
                    Ya no me interesa
                  </button>
                </form>
              )}
            </article>
          );
        })}
      </div>

      <section id="buscar-duenos" className="tarjeta pila" style={{ marginTop: 20 }}>
        <h2>Buscar dueños desde Chrome</h2>
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
    </>
  );
}
