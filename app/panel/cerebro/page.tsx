import Link from "next/link";
import { fechaCorta } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../aviso";
import { Volver } from "../volver";
import { archivar, ensenar, responderDuda } from "./acciones";
import { MapaCerebro, type Rama } from "./mapa";
import { IconoCheck, IconoIdea, IconoLapiz } from "../iconos";
import { EncabezadoPagina, Vacio } from "../piezas";

// Segundo cerebro de la asistente: qué sabe, de dónde aprende y qué no supo contestar. Cada duda que el
// corredor responde pasa a ser algo que la asistente ya sabe y usa al contestar.

type Item = { id: string; tema: string; respuesta: string | null; origen: string; veces: number; updated_at: string };
type Ver = "mapa" | "dudas" | "sabe" | "errores" | "fuentes";

export default async function Cerebro({ searchParams }: { searchParams: Promise<{ ver?: string; aviso?: string }> }) {
  const { ver: pedido, aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const [{ data: items, error: errorCerebro }, { data: correcciones }, { data: casasData }, { data: franjasData }] = await Promise.all([
    supabase
      .from("conocimiento")
      .select("id, tema, respuesta, origen, veces, updated_at, estado")
      .eq("corredor_id", corredor.id)
      .neq("estado", "archivado")
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("correcciones")
      .select("id, original, corregido, created_at")
      .eq("corredor_id", corredor.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("propiedades").select("id, titulo").eq("corredor_id", corredor.id).eq("estado", "activa").limit(100),
    supabase.from("horarios_visitas").select("dia_semana, hora_inicio, hora_fin").eq("corredor_id", corredor.id).order("dia_semana"),
  ]);
  const todos = (items ?? []) as (Item & { estado: string })[];
  const dudas = todos.filter((i) => i.estado === "pendiente");
  const sabe = todos.filter((i) => i.estado === "activo");
  const errores = (correcciones ?? []) as { id: string; original: string; corregido: string; created_at: string }[];
  const casasLista = (casasData ?? []) as { id: string; titulo: string }[];
  const franjas = (franjasData ?? []) as { dia_semana: number; hora_inicio: string; hora_fin: string }[];
  const casas = casasLista.length;
  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const ver: Ver = (["mapa", "dudas", "sabe", "errores", "fuentes"] as const).find((v) => v === pedido) ?? (dudas.length ? "dudas" : "mapa");
  const ramas: Rama[] = [
    { clave: "casas", nombre: "Casas", href: "/panel/propiedades", tono: "verde", hojas: casasLista.map((c) => ({ texto: c.titulo, href: `/panel/propiedades/${c.id}` })) },
    { clave: "sabe", nombre: "Lo que sabe", href: "/panel/cerebro?ver=sabe", tono: "azul", hojas: sabe.map((k) => ({ texto: k.tema, href: "/panel/cerebro?ver=sabe" })) },
    { clave: "dudas", nombre: "Dudas", href: "/panel/cerebro?ver=dudas", tono: "ambar", hojas: dudas.map((d) => ({ texto: d.tema, href: "/panel/cerebro?ver=dudas" })) },
    { clave: "correcciones", nombre: "Correcciones", href: "/panel/cerebro?ver=errores", tono: "morado", hojas: errores.slice(0, 8).map((e) => ({ texto: e.corregido, href: "/panel/cerebro?ver=errores" })) },
    {
      clave: "horario",
      nombre: "Horario",
      href: "/panel/agenda/horario",
      tono: "gris",
      hojas: franjas.map((f) => ({ texto: `${DIAS[f.dia_semana]} ${f.hora_inicio.slice(0, 5)}–${f.hora_fin.slice(0, 5)}`, href: "/panel/agenda/horario" })),
    },
    { clave: "temas", nombre: "Te los pasa", href: "/panel/ajustes", tono: "gris", hojas: corredor.reglas_escalamiento.map((t) => ({ texto: t, href: "/panel/ajustes" })) },
  ];

  const pestana = (v: Ver, nombre: string, n?: number) => (
    <Link href={`/panel/cerebro?ver=${v}`} aria-current={ver === v ? "page" : undefined}>
      {nombre}
      {n !== undefined && <span>{n}</span>}
    </Link>
  );

  // De dónde aprende: su pestaña y, en computadora, la columna de al lado de las listas.
  const fuentes = (
    <ul className="fuentes">
      <li>
        <Link href="/panel/propiedades">
          <strong>{casas}</strong> casas en oferta <span className="suave">precios, zonas y datos de cada ficha</span>
        </Link>
      </li>
      <li>
        <Link href="/panel/cerebro?ver=sabe">
          <strong>{sabe.length}</strong> cosas que le enseñaste <span className="suave">políticas y preguntas frecuentes</span>
        </Link>
      </li>
      <li>
        <Link href="/panel/cerebro?ver=errores">
          <strong>{Math.min(errores.length, 8)}</strong> correcciones recientes <span className="suave">tu forma de escribir</span>
        </Link>
      </li>
      <li>
        <Link href="/panel/agenda/horario">
          <strong>{franjas.length}</strong> horarios de visita <span className="suave">cuándo puede ofrecer citas</span>
        </Link>
      </li>
      <li>
        <Link href="/panel/ajustes">
          <strong>{corredor.reglas_escalamiento.length}</strong> temas que te pasa a ti <span className="suave">y tu tono: “{corredor.tono || "sin definir"}”</span>
        </Link>
      </li>
    </ul>
  );

  return (
    <>
      <Volver href="/panel/mas" texto="Más" />
      <EncabezadoPagina titulo="Cerebro de la asistente" apoyo="Lo que sabe para contestar, y lo que te pregunta." />
      <Aviso texto={aviso} />
      {errorCerebro && (
        <p className="aviso">No se pudo leer lo que sabe la asistente. Avísale a soporte con este código: {errorCerebro.code ?? "sin código"}.</p>
      )}

      <nav className="filtro-etapas" aria-label="Secciones del cerebro">
        {pestana("mapa", "Mapa")}
        {pestana("dudas", "Dudas", dudas.length)}
        {pestana("sabe", "Lo que sabe", sabe.length)}
        {pestana("errores", "Correcciones", errores.length)}
        {pestana("fuentes", "De dónde aprende")}
      </nav>

      {ver === "mapa" && <MapaCerebro ramas={ramas} />}

      <div className={ver === "dudas" || ver === "sabe" || ver === "errores" ? "dos-columnas" : undefined}>
        <div className="columna-principal">

      {ver === "dudas" && (
        <section className="pila">
          {dudas.length === 0 ? (
            <Vacio Icono={IconoCheck} titulo="No tiene dudas.">
              Cuando un cliente pregunte algo que no sabe, aparece aquí.
            </Vacio>
          ) : (
            dudas.map((d) => (
              <form key={d.id} action={responderDuda} className="tarjeta pila">
                <input type="hidden" name="id" value={d.id} />
                <strong>{d.tema}</strong>
                <span className="suave">
                  {d.veces > 1 ? `Le preguntaron ${d.veces} veces · ` : ""}
                  {fechaCorta(d.updated_at.slice(0, 10))}
                </span>
                <label htmlFor={`r-${d.id}`} className="oculto">
                  Respuesta
                </label>
                <textarea id={`r-${d.id}`} name="respuesta" rows={3} placeholder="Escribe la respuesta: la asistente la usará desde ahora." />
                <div className="botones">
                  <button type="submit" className="primario">
                    Enseñárselo
                  </button>
                  <button type="submit" formAction={archivar} name="ver" value="dudas">
                    No hace falta
                  </button>
                </div>
              </form>
            ))
          )}
        </section>
      )}

      {ver === "sabe" && (
        <section className="pila">
          <form action={ensenar} className="tarjeta pila">
            <strong>Enseñarle algo</strong>
            <label htmlFor="tema">Tema o pregunta</label>
            <input data-patty="cerebro-ensenar" id="tema" name="tema" type="text" placeholder="¿Aceptan mascotas en los alquileres?" />
            <label htmlFor="respuesta">Respuesta</label>
            <textarea id="respuesta" name="respuesta" rows={3} placeholder="Sí, perros pequeños, con un depósito extra de un mes." />
            <button type="submit" className="primario">
              Guardar
            </button>
          </form>
          {sabe.length === 0 && (
            <Vacio Icono={IconoIdea} compacto>
              Todavía no le enseñaste nada.
            </Vacio>
          )}
          {sabe.map((k) => (
            <details key={k.id} className="tarjeta saber">
              <summary>
                <strong>{k.tema}</strong>
                <span className="suave">{k.respuesta}</span>
              </summary>
              <form action={responderDuda} className="pila">
                <input type="hidden" name="id" value={k.id} />
                <input type="hidden" name="ver" value="sabe" />
                <label htmlFor={`t-${k.id}`}>Tema</label>
                <input id={`t-${k.id}`} name="tema" type="text" defaultValue={k.tema} />
                <label htmlFor={`s-${k.id}`}>Respuesta</label>
                <textarea id={`s-${k.id}`} name="respuesta" rows={3} defaultValue={k.respuesta ?? ""} />
                <div className="botones">
                  <button type="submit" className="primario">
                    Guardar
                  </button>
                  <button type="submit" formAction={archivar} className="peligro">
                    Olvidarlo
                  </button>
                </div>
              </form>
            </details>
          ))}
        </section>
      )}

      {ver === "errores" && (
        <section className="pila">
          <p className="suave">Respuestas que cambiaste antes de enviar. Las últimas le enseñan tu forma de escribir.</p>
          {errores.length === 0 && (
            <Vacio Icono={IconoLapiz} compacto>
              Todavía no has corregido ninguna respuesta.
            </Vacio>
          )}
          {errores.map((e) => (
            <article key={e.id} className="tarjeta pila correccion">
              <span className="suave">{fechaCorta(e.created_at.slice(0, 10))}</span>
              <p className="antes">{e.original}</p>
              <p className="despues">{e.corregido}</p>
            </article>
          ))}
        </section>
      )}

      {ver === "fuentes" && fuentes}
        </div>
        {(ver === "dudas" || ver === "sabe" || ver === "errores") && (
          <aside className="columna-lateral tarjeta pila ayuda-lateral solo-computadora" aria-label="De dónde aprende">
            <h2>De dónde aprende</h2>
            {fuentes}
            <p className="suave">Cada duda que contestas pasa a lo que sabe y la usa desde ese momento.</p>
          </aside>
        )}
      </div>
    </>
  );
}
