import Link from "next/link";
import { fechaCorta } from "@/lib/formato";
import { Aviso } from "../aviso";
import { IconoAgenda, IconoCampana, IconoCasa, IconoChats, IconoCheck, IconoFlecha, IconoIdea, IconoLapiz } from "../iconos";
import { EncabezadoPagina, Vacio } from "../piezas";
import { archivar, responderDuda } from "./acciones";
import { EnsenaleAlgo } from "./ensenar";
import { LoQueSabe, type Ubicada } from "./lo-que-sabe";
import { MapaCerebro, type Rama } from "./mapa";
import { CATEGORIAS, categoriaDeTema, diferenciaPalabras, fraseEstado, listaPreparacion, type Parte } from "./resumen";

// Lo que se ve del Cerebro de la asistente, sin leer nada: la página lee con la sesión y pasa los datos. Portada
// (lo urgente, qué tan lista está y "Enséñale algo"), Preguntas, Lo que sabe, Correcciones, Fuentes y el mapa.

export type Ver = "inicio" | "dudas" | "sabe" | "errores" | "fuentes" | "mapa";
export const VISTAS: Ver[] = ["inicio", "dudas", "sabe", "errores", "fuentes", "mapa"];

export type Duda = { id: string; tema: string; veces: number; updated_at: string };
export type Sabido = { id: string; tema: string; respuesta: string | null; updated_at: string };
export type PorUbicar = { id: string; casaId: string; codigo: string; titulo: string; sitio: string };
export type Correccion = { id: string; original: string; corregido: string; created_at: string };

export type DatosCerebro = {
  ver: Ver;
  aviso?: string;
  errorCodigo?: string | null;
  nombre: string;
  dudas: Duda[];
  porUbicar: PorUbicar[];
  sabe: Sabido[];
  ubicadas: Ubicada[];
  correcciones: Correccion[];
  casas: { id: string; titulo: string; precio: number | null; fotos: number }[];
  franjas: { dia_semana: number; hora_inicio: string; hora_fin: string }[];
  tono: string;
  temas: string[];
};

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Cuántas correcciones entran como ejemplos de tono al contestar (lib/asistente/procesar.ts). */
const CORRECCIONES_EN_USO = 8;

export function VistaCerebro(d: DatosCerebro) {
  const preguntas = d.dudas.length + d.porUbicar.length;
  const lateral = d.ver !== "mapa";

  const pestana = (v: Ver, nombre: React.ReactNode, n?: number) => (
    <Link
      href={v === "inicio" ? "/panel/cerebro" : `/panel/cerebro?ver=${v}`}
      aria-current={d.ver === v ? "page" : undefined}
      data-patty={`cerebro-pestana-${v === "dudas" ? "preguntas" : v === "errores" ? "correcciones" : v}`}
    >
      {nombre}
      {n !== undefined && n > 0 && <span className={v === "dudas" ? "cer-n urgente" : "cer-n"}>{n}</span>}
    </Link>
  );

  return (
    <div className={`cerebro cerebro-${d.ver}`}>
      <EncabezadoPagina titulo="Cerebro de la asistente" apoyo={`Lo que ${d.nombre} sabe para contestar, y lo que te pregunta.`} atras={{ href: "/panel/mas", texto: "Más", soloTelefono: true }} />
      <Aviso texto={d.aviso} />
      {d.errorCodigo !== undefined && d.errorCodigo !== null && (
        <p className="aviso">No se pudo leer lo que sabe la asistente. Avísale a soporte con este código: {d.errorCodigo || "sin código"}.</p>
      )}

      <nav className="cer-pestanas" aria-label="Secciones del cerebro">
        <div className="cer-pestanas-fila tira-desliza">
          {pestana("inicio", "Inicio")}
          {pestana("dudas", "Preguntas", preguntas)}
          {pestana(
            "sabe",
            <>
              <span className="cer-largo">Lo que sabe</span>
              <span className="cer-corto">Sabe</span>
            </>,
            d.sabe.length + d.ubicadas.length,
          )}
          {pestana("errores", "Correcciones", d.correcciones.length)}
          {pestana("fuentes", "Fuentes")}
          {pestana("mapa", "Mapa")}
        </div>
      </nav>

      {d.ver === "mapa" ? (
        <Mapa {...d} />
      ) : (
        <div className="cer-cuerpo">
          {d.ver === "inicio" && <Urgente {...d} />}
          {lateral && (
            <aside className="cer-lateral" aria-label="Enséñale algo y qué tan lista está">
              <EnsenaleAlgo nombre={d.nombre} />
              <Preparacion {...d} />
            </aside>
          )}
          <div className="cer-principal">
            {d.ver !== "inicio" && (
              <p className="cer-ir-ensenar">
                <Link href="/panel/cerebro#ensenar">
                  <IconoIdea tamano={20} />
                  Enseñarle algo
                </Link>
              </p>
            )}
            {d.ver === "inicio" && <Portada {...d} />}
            {d.ver === "dudas" && <Preguntas {...d} />}
            {d.ver === "sabe" && <Sabe {...d} />}
            {d.ver === "errores" && <Correcciones {...d} />}
            {d.ver === "fuentes" && <Fuentes {...d} />}
          </div>
        </div>
      )}

    </div>
  );
}

/** Una pregunta que no supo contestar, con su formulario de siempre. */
function FormDuda({ d, destacada }: { d: Duda; destacada?: boolean }) {
  return (
    <form action={responderDuda} className={destacada ? "cer-duda-form" : "cer-caja cer-duda"}>
      <input type="hidden" name="id" value={d.id} />
      <input type="hidden" name="ver" value="dudas" />
      <p className="cer-duda-tema">{d.tema}</p>
      <p className="suave">
        {d.veces > 1 ? `Le preguntaron ${d.veces} veces · ` : ""}
        {fechaCorta(d.updated_at.slice(0, 10))}
      </p>
      <label htmlFor={`r-${d.id}`} className="oculto">
        Respuesta
      </label>
      <textarea
        id={`r-${d.id}`}
        name="respuesta"
        rows={3}
        maxLength={2000}
        placeholder="Escribe la respuesta: la usará desde ahora."
        data-patty={destacada ? "cerebro-responder" : undefined}
      />
      <div className="botones">
        <button type="submit" className="primario">
          Enseñárselo
        </button>
        <button type="submit" formAction={archivar}>
          No hace falta
        </button>
      </div>
    </form>
  );
}

function Ubicaciones({ porUbicar, todas }: { porUbicar: PorUbicar[]; todas?: boolean }) {
  if (!porUbicar.length) return null;
  const lista = todas ? porUbicar : porUbicar.slice(0, 3);
  return (
    <section className="cer-caja cer-ubicar" aria-labelledby="ubicar-titulo" data-patty="cerebro-ubicaciones">
      <p className="cer-sobre">Casas del sitio</p>
      <h2 id="ubicar-titulo">¿Dónde queda esta casa?</h2>
      <p className="suave">El sitio no dice claro la zona. Elegirla toma un toque y sirve para calcular el traslado de las visitas.</p>
      <ul>
        {lista.map((u) => (
          <li key={u.id}>
            <Link href={`/panel/propiedades/${u.casaId}`}>
              <span className="cer-ubicar-texto">
                <strong>{u.titulo}</strong>
                <span className="suave">
                  {u.codigo} · el sitio dice «{u.sitio}»
                </span>
              </span>
              <span className="cer-ubicar-accion">
                Elegir zona <IconoFlecha tamano={18} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {porUbicar.length > lista.length && (
        <Link href="/panel/propiedades" className="cer-mas">
          Ver las {porUbicar.length} en Mis casas
        </Link>
      )}
    </section>
  );
}

/** Portada, arriba: la frase de cómo va y lo que espera respuesta. */
function Urgente(d: DatosCerebro) {
  const [primera, ...resto] = d.dudas;
  return (
    <div className="cer-urgente">
      <p className="cer-estado">
        <span className="cer-estado-icono" aria-hidden>
          <IconoIdea tamano={22} />
        </span>
        {fraseEstado(d.nombre, { sabe: d.sabe.length, correcciones: d.correcciones.length, preguntas: d.dudas.length + d.porUbicar.length })}
      </p>
      {primera ? (
        <section className="cer-caja cer-pendiente" aria-labelledby="pendiente-titulo" data-patty="cerebro-pregunta">
          <p className="cer-sobre">Te necesita</p>
          <h2 id="pendiente-titulo">{d.nombre} no supo contestar esto</h2>
          <FormDuda d={primera} destacada />
          {resto.length > 0 && (
            <Link href="/panel/cerebro?ver=dudas" className="cer-mas">
              Ver {resto.length === 1 ? "la otra pregunta" : `las otras ${resto.length}`}
            </Link>
          )}
        </section>
      ) : (
        !d.porUbicar.length && (
          <p className="cer-al-dia">
            <span aria-hidden>
              <IconoCheck tamano={18} />
            </span>
            No tiene preguntas para ti. Cuando un cliente pregunte algo que no sabe, aparece aquí primero.
          </p>
        )
      )}
      <Ubicaciones porUbicar={d.porUbicar} />
    </div>
  );
}

/** Portada, abajo: lo último que aprendió y los atajos. */
function Portada(d: DatosCerebro) {
  const ultimos = d.sabe.slice(0, 4);
  const ultima = d.correcciones[0];
  return (
    <>
      <section className="cer-bloque" aria-labelledby="ultimo-titulo">
        <div className="cer-bloque-titulo">
          <h2 id="ultimo-titulo">Lo último que le enseñaste</h2>
          {d.sabe.length > ultimos.length && (
            <Link href="/panel/cerebro?ver=sabe" className="cer-mas">
              Ver todo ({d.sabe.length})
            </Link>
          )}
        </div>
        {ultimos.length ? (
          <ul className="cer-lista">
            {ultimos.map((k) => (
              <li key={k.id}>
                <Link href="/panel/cerebro?ver=sabe">
                  <strong>{k.tema}</strong>
                  <span className="suave">{k.respuesta}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Vacio Icono={IconoIdea} titulo="Todavía no le has enseñado nada." compacto accion={<a href="#ensenar">Enseñarle lo primero</a>}>
            Empieza por lo que más te preguntan: mascotas, parqueo, formas de pago.
          </Vacio>
        )}
      </section>

      {ultima && (
        <section className="cer-bloque" aria-labelledby="correccion-titulo">
          <div className="cer-bloque-titulo">
            <h2 id="correccion-titulo">Tu última corrección</h2>
            <Link href="/panel/cerebro?ver=errores" className="cer-mas">
              Ver todas ({d.correcciones.length})
            </Link>
          </div>
          <TarjetaCorreccion c={ultima} />
        </section>
      )}

      <Link href="/panel/cerebro?ver=mapa" className="cer-caja cer-ver-mapa" data-patty="cerebro-ver-mapa">
        <span>
          <strong>Ver el mapa</strong>
          <span className="suave">Todo lo que sabe y de dónde lo aprende, en un dibujo.</span>
        </span>
        <IconoFlecha tamano={22} />
      </Link>
    </>
  );
}

/** Qué tan lista está: renglones hechos por código, "5 de 7 listas". */
function Preparacion(d: DatosCerebro) {
  const lista = listaPreparacion({
    casas: d.casas,
    franjas: d.franjas.length,
    tono: d.tono,
    temasCorredor: d.temas.length,
    sabe: d.sabe.length,
    preguntas: d.dudas.length + d.porUbicar.length,
  });
  const listos = lista.filter((r) => r.listo).length;
  return (
    <section className="cer-caja cer-lista-lista" aria-labelledby="lista-titulo" data-patty="cerebro-lista">
      <div className="cer-lista-cabeza">
        <h2 id="lista-titulo">Qué tan lista está</h2>
        <p className="cer-lista-cuenta">
          <strong>{listos}</strong> de {lista.length} listas
        </p>
      </div>
      <div className="cer-segmentos" aria-hidden>
        {lista.map((r) => (
          <span key={r.clave} className={r.listo ? "listo" : undefined} />
        ))}
      </div>
      <ul>
        {lista.map((r) => (
          <li key={r.clave} className={r.listo ? "listo" : "falta"}>
            <Link href={r.href}>
              <span className="cer-marca" aria-hidden>
                {r.listo ? <IconoCheck tamano={16} /> : null}
              </span>
              <span className="cer-renglon">
                <strong>
                  {r.titulo}
                  <span className="oculto">{r.listo ? " (listo)" : " (pendiente)"}</span>
                </strong>
                <span className="suave">{r.detalle}</span>
              </span>
              {!r.listo && <span className="cer-renglon-accion">{r.accion}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Preguntas(d: DatosCerebro) {
  if (!d.dudas.length && !d.porUbicar.length) {
    return (
      <Vacio Icono={IconoCheck} titulo="No tiene preguntas para ti.">
        Cuando un cliente pregunte algo que {d.nombre} no sabe, aparece aquí. Lo contestas una vez y desde entonces lo sabe.
      </Vacio>
    );
  }
  return (
    <div className="cer-pila">
      <Ubicaciones porUbicar={d.porUbicar} todas />
      {d.dudas.length > 0 && (
        <section className="cer-bloque" aria-labelledby="dudas-titulo">
          <h2 id="dudas-titulo">No supo contestar esto</h2>
          <p className="suave">Contéstalo una vez y desde entonces lo sabe. Si no hace falta, quítalo.</p>
          <div className="cer-pila">
            {d.dudas.map((x) => (
              <FormDuda key={x.id} d={x} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Sabe(d: DatosCerebro) {
  if (!d.sabe.length && !d.ubicadas.length) {
    return (
      <Vacio Icono={IconoIdea} titulo="Todavía no le has enseñado nada." accion={<a href="#ensenar">Enseñarle lo primero</a>}>
        Empieza por lo que más te preguntan. Toca una idea en «Enséñale algo» y escribe cómo quieres que conteste.
      </Vacio>
    );
  }
  const porCategoria = new Map<string, Sabido[]>();
  for (const k of d.sabe) {
    const c = categoriaDeTema(k.tema, k.respuesta);
    porCategoria.set(c, [...(porCategoria.get(c) ?? []), k]);
  }
  const grupos = CATEGORIAS.map((c) => ({ clave: c.clave, nombre: c.nombre, items: porCategoria.get(c.clave) ?? [] })).filter((g) => g.items.length);
  return <LoQueSabe grupos={grupos} ubicadas={d.ubicadas} />;
}

function Marcado({ partes, clase }: { partes: Parte[]; clase: "quitado" | "puesto" }) {
  return (
    <>
      {partes.map((p, i) =>
        p.cambio ? (
          clase === "quitado" ? (
            <del key={i}>{p.texto}</del>
          ) : (
            <ins key={i}>{p.texto}</ins>
          )
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}

function TarjetaCorreccion({ c }: { c: Correccion }) {
  const dif = diferenciaPalabras(c.original, c.corregido);
  return (
    <article className="cer-caja cer-correccion">
      <p className="suave">{fechaCorta(c.created_at.slice(0, 10))}</p>
      <div className="cer-antes-despues">
        <div className="cer-antes">
          <p className="cer-sobre">Antes</p>
          <p>
            <Marcado partes={dif.antes} clase="quitado" />
          </p>
        </div>
        <div className="cer-despues">
          <p className="cer-sobre">Después, como la mandaste</p>
          <p>
            <Marcado partes={dif.despues} clase="puesto" />
          </p>
        </div>
      </div>
    </article>
  );
}

function Correcciones(d: DatosCerebro) {
  if (!d.correcciones.length) {
    return (
      <Vacio Icono={IconoLapiz} titulo="Todavía no has corregido ninguna respuesta.">
        Cuando cambies una respuesta antes de enviarla, aparece aquí. Así aprende tu forma de escribir.
      </Vacio>
    );
  }
  return (
    <div className="cer-pila">
      <p className="suave cer-intro">
        Respuestas que cambiaste antes de enviar. Marcado, lo que cambió. Usa las {CORRECCIONES_EN_USO} últimas para escribir como tú.
      </p>
      {d.correcciones.map((c) => (
        <TarjetaCorreccion key={c.id} c={c} />
      ))}
    </div>
  );
}

function Fuentes(d: DatosCerebro) {
  const fuentes = [
    { clave: "casas", Icono: IconoCasa, n: d.casas.length, nombre: "Tus casas en oferta", detalle: "Precio, zona y datos de cada ficha.", href: "/panel/propiedades", ir: "Mis casas" },
    { clave: "sabe", Icono: IconoIdea, n: d.sabe.length, nombre: "Lo que le enseñaste", detalle: "Respuestas a lo que más te preguntan.", href: "/panel/cerebro?ver=sabe", ir: "Lo que sabe" },
    {
      clave: "correcciones",
      Icono: IconoLapiz,
      n: Math.min(d.correcciones.length, CORRECCIONES_EN_USO),
      nombre: "Tus correcciones",
      detalle: `Las ${CORRECCIONES_EN_USO} últimas le enseñan tu forma de escribir.`,
      href: "/panel/cerebro?ver=errores",
      ir: "Correcciones",
    },
    { clave: "horario", Icono: IconoAgenda, n: d.franjas.length, nombre: "Horario de visitas", detalle: "Cuándo puede ofrecer citas.", href: "/panel/agenda/horario", ir: "Mi horario" },
    {
      clave: "tono",
      Icono: IconoChats,
      n: null,
      nombre: "Tu tono",
      detalle: d.tono.trim() ? `«${d.tono.trim()}»` : "Todavía no le dijiste cómo escribir.",
      href: "/panel/ajustes",
      ir: "Ajustes",
    },
    {
      clave: "temas",
      Icono: IconoCampana,
      n: d.temas.length,
      nombre: "Temas que van a ti",
      detalle: d.temas.length ? d.temas.join(" · ") : "Ninguno: lo contesta todo.",
      href: "/panel/ajustes",
      ir: "Ajustes",
    },
  ];
  return (
    <div className="cer-pila">
      <p className="suave cer-intro">Con esto contesta {d.nombre}. Si algo no está bien, se arregla donde dice cada tarjeta.</p>
      <ul className="cer-fuentes">
        {fuentes.map((f) => (
          <li key={f.clave}>
            <Link href={f.href} className={`cer-caja cer-fuente fuente-${f.clave}`}>
              <span className="cer-fuente-icono" aria-hidden>
                <f.Icono tamano={22} />
              </span>
              <span className="cer-fuente-texto">
                {f.n !== null && <span className="cer-fuente-n">{f.n}</span>}
                <strong>{f.nombre}</strong>
                <span className="suave">{f.detalle}</span>
              </span>
              <span className="cer-fuente-ir">
                {f.ir} <IconoFlecha tamano={16} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LEYENDA: { tono: Rama["tono"]; texto: string }[] = [
  { tono: "verde", texto: "Casas" },
  { tono: "azul", texto: "Lo que sabe" },
  { tono: "ambar", texto: "Lo que todavía no sabe" },
  { tono: "morado", texto: "Tus correcciones" },
  { tono: "gris", texto: "Horario y temas que van a ti" },
];

function Mapa(d: DatosCerebro) {
  const ramas: Rama[] = [
    { clave: "casas", nombre: "Casas", href: "/panel/propiedades", tono: "verde", hojas: d.casas.map((c) => ({ texto: c.titulo, href: `/panel/propiedades/${c.id}` })) },
    { clave: "sabe", nombre: "Lo que sabe", href: "/panel/cerebro?ver=sabe", tono: "azul", hojas: d.sabe.map((k) => ({ texto: k.tema, href: "/panel/cerebro?ver=sabe" })) },
    {
      clave: "dudas",
      nombre: "Preguntas",
      href: "/panel/cerebro?ver=dudas",
      tono: "ambar",
      hojas: [
        ...d.dudas.map((x) => ({ texto: x.tema, href: "/panel/cerebro?ver=dudas" })),
        ...d.porUbicar.map((u) => ({ texto: `¿Dónde queda ${u.titulo}?`, href: `/panel/propiedades/${u.casaId}` })),
      ],
    },
    { clave: "correcciones", nombre: "Correcciones", href: "/panel/cerebro?ver=errores", tono: "morado", hojas: d.correcciones.slice(0, CORRECCIONES_EN_USO).map((e) => ({ texto: e.corregido, href: "/panel/cerebro?ver=errores" })) },
    {
      clave: "horario",
      nombre: "Horario",
      href: "/panel/agenda/horario",
      tono: "gris",
      hojas: d.franjas.map((f) => ({ texto: `${DIAS[f.dia_semana]} ${f.hora_inicio.slice(0, 5)}–${f.hora_fin.slice(0, 5)}`, href: "/panel/agenda/horario" })),
    },
    { clave: "temas", nombre: "Te los pasa", href: "/panel/ajustes", tono: "gris", hojas: d.temas.map((t) => ({ texto: t, href: "/panel/ajustes" })) },
  ];
  return (
    <section className="cer-mapa" aria-labelledby="mapa-titulo">
      <header className="cer-mapa-cabeza">
        <div>
          <h2 id="mapa-titulo">Mapa de lo que sabe</h2>
          <ul className="cer-leyenda" aria-label="Qué es cada color">
            {LEYENDA.map((l) => (
              <li key={l.tono} className={`tono-${l.tono}`}>
                {l.texto}
              </li>
            ))}
          </ul>
        </div>
        <Link href="/panel/cerebro" className="boton cer-cerrar" data-patty="cerebro-cerrar-mapa">
          Cerrar
        </Link>
      </header>
      <MapaCerebro ramas={ramas} />
    </section>
  );
}
