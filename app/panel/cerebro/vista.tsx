import Link from "next/link";
import { fechaCorta } from "@/lib/formato";
import { Aviso } from "../aviso";
import {
  IconoAgenda,
  IconoAsistente,
  IconoCampana,
  IconoCasa,
  IconoChats,
  IconoCheck,
  IconoFlecha,
  IconoIdea,
  IconoLapiz,
  IconoProbar,
} from "../iconos";
import { EncabezadoPagina, Vacio } from "../piezas";
import { archivar, responderDuda } from "./acciones";
import { IrAlAncla } from "./ancla";
import { EnsenaleAlgo } from "./ensenar";
import { LoQueSabe, type Ubicada } from "./lo-que-sabe";
import { MapaCerebro, type Rama } from "./mapa";
import { NOMBRE_CEREBRO, apoyoCerebro } from "./nombre";
import {
  CATEGORIAS,
  categoriaDeTema,
  correccionesRecientes,
  diasDelHorario,
  diferenciaPalabras,
  faltaPreparacion,
  fraseEstado,
  listaPuesta,
  pendientesCerebro,
  resumenHorario,
  seccionesCerebro,
  vistaCerebro,
  type InfoSeccion,
  type Parte,
  type Renglon,
  type Seccion,
} from "./resumen";

// Lo que se ve del Cerebro de IA, sin leer nada: la página lee con la sesión y pasa los datos. Arriba, el tablero de
// la asistente; debajo, tres secciones que responden tres preguntas: qué necesita de ti (lo pendiente), qué sabe
// (todo lo que usa para contestar, por fuente, con "Enséñale algo" arriba) y cómo contesta (tono, temas que te
// pasa, tus correcciones y si contesta sola). El mapa es otra forma de ver "lo que sabe", a pantalla completa.

export type Duda = {
  id: string;
  tema: string;
  veces: number;
  updated_at: string;
};
export type Sabido = {
  id: string;
  tema: string;
  respuesta: string | null;
  updated_at: string;
};
export type PorUbicar = {
  id: string;
  casaId: string;
  codigo: string;
  titulo: string;
  sitio: string;
};
export type Correccion = {
  id: string;
  original: string;
  corregido: string;
  created_at: string;
};

export type DatosCerebro = {
  /** El `?ver=` de la dirección, nuevo o viejo (resumen.ts, vistaCerebro). */
  pedido?: string;
  /** Ahora, en ISO (para "esta semana corregiste…"). */
  ahora: string;
  aviso?: string;
  errorCodigo?: string | null;
  nombre: string;
  automatica: boolean;
  dudas: Duda[];
  porUbicar: PorUbicar[];
  sabe: Sabido[];
  ubicadas: Ubicada[];
  correcciones: Correccion[];
  casas: { id: string; titulo: string; precio: number | null; fotos: number }[];
  franjas: { dia_semana: number; hora_inicio: string; hora_fin: string }[];
  tono: string;
  temas: string[];
  /** Google conectado (cuenta como un paso de la puesta en marcha). */
  google: boolean;
};

/** Lo que la vista calcula una vez y comparten las secciones. */
type Calculado = DatosCerebro & {
  lista: Renglon[];
  falta: Renglon[];
  recientes: number;
};

/** Cuántas correcciones entran como ejemplos de tono al contestar (lib/asistente/procesar.ts). */
const CORRECCIONES_EN_USO = 8;
const ICONOS: Record<Seccion, typeof IconoIdea> = {
  necesita: IconoCampana,
  sabe: IconoIdea,
  contesta: IconoChats,
};

export function VistaCerebro(d: DatosCerebro) {
  // Los mismos 6 pasos y el mismo conteo que la puesta en marcha; las preguntas son un pendiente aparte.
  const lista = listaPuesta({
    casas: d.casas,
    franjas: d.franjas.length,
    tono: d.tono,
    temasCorredor: d.temas.length,
    google: d.google,
  });
  const falta = faltaPreparacion(lista);
  const pendientes = pendientesCerebro({
    preguntas: d.dudas.length,
    porUbicar: d.porUbicar.length,
    falta: falta.length,
  });
  const { ver, ancla } = vistaCerebro(d.pedido, pendientes);
  const c: Calculado = {
    ...d,
    lista,
    falta,
    recientes: correccionesRecientes(
      d.correcciones.map((x) => x.created_at),
      new Date(d.ahora),
    ),
  };
  const secciones = seccionesCerebro({
    preguntas: d.dudas.length,
    porUbicar: d.porUbicar.length,
    falta: falta.length,
    ensenado: d.sabe.length,
    ubicadas: d.ubicadas.length,
    casas: d.casas.length,
    correcciones: d.correcciones.length,
    automatica: d.automatica,
  });

  return (
    <div className={`cerebro cerebro-${ver}`}>
      <EncabezadoPagina titulo={NOMBRE_CEREBRO} apoyo={apoyoCerebro(d.nombre)} atras={{ href: "/panel/mas", texto: "Más", soloTelefono: true }} />
      <Aviso texto={d.aviso} />
      {d.errorCodigo !== undefined && d.errorCodigo !== null && (
        <p className="aviso">No se pudo leer lo que sabe la asistente. Avísale a soporte con este código: {d.errorCodigo || "sin código"}.</p>
      )}

      {ver === "mapa" ? (
        <Mapa {...d} />
      ) : (
        <>
          <Tablero {...c} />
          <NavSecciones secciones={secciones} actual={ver} />
          <div className="cer-seccion" id="seccion">
            {ver === "necesita" && <Necesita {...c} />}
            {ver === "sabe" && <Sabe {...c} />}
            {ver === "contesta" && <Contesta {...c} />}
          </div>
          <IrAlAncla ancla={ancla} />
        </>
      )}
    </div>
  );
}

// --- Tablero y navegación ---------------------------------------------------------------------------------

/** Dibujo sobrio de nodos unidos (el mismo lenguaje del mapa): la asistente al centro y lo que sabe alrededor. */
function DibujoNodos() {
  const puntos: [number, number, string][] = [
    [30, 26, "#00a884"],
    [150, 20, "#1f6fd1"],
    [176, 78, "#7a4fc9"],
    [128, 122, "#00a884"],
    [36, 112, "#c46a00"],
    [8, 70, "#667781"],
  ];
  return (
    <svg className="cer-dibujo" viewBox="0 0 190 140" aria-hidden focusable="false">
      {puntos.map(([x, y], i) => (
        <line key={`l${i}`} x1={95} y1={70} x2={x} y2={y} />
      ))}
      <line x1={150} y1={20} x2={176} y2={78} />
      <line x1={36} y1={112} x2={8} y2={70} />
      {puntos.map(([x, y, c], i) => (
        <circle key={`c${i}`} cx={x} cy={y} r={i % 2 ? 7 : 9} fill={c} />
      ))}
      <circle cx={95} cy={70} r={22} className="cer-dibujo-centro" />
    </svg>
  );
}

function Tablero(d: Calculado) {
  const listos = d.lista.filter((r) => r.listo).length;
  return (
    <section className="cer-tablero" aria-label={`Tu asistente, ${d.nombre}`} data-patty="cerebro-tablero">
      <DibujoNodos />
      <div className="cer-tablero-quien">
        <span className="cer-avatar" aria-hidden>
          <IconoAsistente tamano={30} />
        </span>
        <div>
          <p className="cer-tablero-nombre">{d.nombre}</p>
          <p className="cer-tablero-rol">Tu asistente de IA</p>
        </div>
      </div>
      <p className="cer-tablero-frase">
        {fraseEstado(d.nombre, {
          sabe: d.sabe.length,
          correcciones: d.correcciones.length,
          preguntas: d.dudas.length + d.porUbicar.length,
        })}
      </p>
      <Link href="/panel/empezar" className="cer-tablero-lista" data-patty="cerebro-lista">
        <span className="cer-segmentos" aria-hidden>
          {d.lista.map((r) => (
            <span key={r.clave} className={r.listo ? "listo" : undefined} />
          ))}
        </span>
        <span>
          <strong>
            {listos} de {d.lista.length}
          </strong>{" "}
          listos para contestar sola
        </span>
        <IconoFlecha tamano={16} />
      </Link>
    </section>
  );
}

const LUGAR: Record<Seccion, string> = {
  necesita: "cerebro-seccion-necesita",
  sabe: "cerebro-seccion-sabe",
  contesta: "cerebro-seccion-contesta",
};

function NavSecciones({ secciones, actual }: { secciones: InfoSeccion[]; actual: string }) {
  return (
    <nav className="cer-secciones" aria-label={`Secciones del ${NOMBRE_CEREBRO}`}>
      {secciones.map((s) => {
        const Icono = ICONOS[s.clave];
        return (
          <Link
            key={s.clave}
            href={`/panel/cerebro?ver=${s.clave}`}
            aria-current={actual === s.clave ? "page" : undefined}
            className={`cer-sec sec-${s.clave}${s.urgente ? " urgente" : ""}`}
            data-patty={LUGAR[s.clave]}
          >
            <span className="cer-sec-icono" aria-hidden>
              <Icono tamano={22} />
            </span>
            <span className="cer-sec-texto">
              <span className="cer-sec-titulo">
                <span className="cer-largo">{s.titulo}</span>
                <span className="cer-corto">{s.corto}</span>
              </span>
              <span className="cer-sec-linea">{s.linea}</span>
            </span>
            {s.clave === "necesita" && s.numero === 0 ? (
              <span className="cer-sec-n al-dia">
                <IconoCheck tamano={16} />
                <span className="oculto">al día</span>
              </span>
            ) : (
              s.numero !== null && <span className="cer-sec-n">{s.numero}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Título de sección con una línea y, si hay, la acción a la derecha. */
function CabezaSeccion({ titulo, linea, children }: { titulo: string; linea: string; children?: React.ReactNode }) {
  return (
    <header className="cer-cabeza">
      <div>
        <h2>{titulo}</h2>
        <p className="suave">{linea}</p>
      </div>
      {children && <div className="cer-cabeza-acciones">{children}</div>}
    </header>
  );
}

/** Un grupo que se pliega: ícono, nombre, cuántos y una línea con el resumen; abierto, su contenido. */
function Grupo({
  id,
  Icono,
  tono,
  titulo,
  n,
  resumen,
  abierto,
  dataPatty,
  children,
}: {
  id: string;
  Icono: typeof IconoIdea;
  tono: "verde" | "azul" | "ambar" | "gris" | "morado";
  titulo: string;
  n?: number;
  resumen: string;
  abierto?: boolean;
  dataPatty?: string;
  children: React.ReactNode;
}) {
  return (
    <details id={id} className={`cer-plegable tono-${tono}`} open={abierto} data-patty={dataPatty}>
      <summary>
        <span className="cer-plegable-icono" aria-hidden>
          <Icono tamano={22} />
        </span>
        <span className="cer-plegable-texto">
          <span className="cer-plegable-titulo">
            {titulo}
            {n !== undefined && <span className="cer-grupo-n">{n}</span>}
          </span>
          <span className="cer-plegable-resumen">{resumen}</span>
        </span>
        <span className="cer-plegable-flecha" aria-hidden>
          <IconoFlecha tamano={18} />
        </span>
      </summary>
      <div className="cer-plegable-cuerpo">{children}</div>
    </details>
  );
}

// --- 1. Lo que necesita de ti ----------------------------------------------------------------------------

/** Una pregunta que no supo contestar, con su formulario de siempre. */
function FormDuda({ d, destacada }: { d: Duda; destacada?: boolean }) {
  return (
    <form
      action={responderDuda}
      className={`cer-caja cer-duda${destacada ? " destacada" : ""}`}
      data-patty={destacada ? "cerebro-pregunta" : undefined}
    >
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

function Ubicaciones({ porUbicar }: { porUbicar: PorUbicar[] }) {
  if (!porUbicar.length) return null;
  const lista = porUbicar.slice(0, 5);
  return (
    <section className="cer-bloque" aria-labelledby="ubicar-titulo" data-patty="cerebro-ubicaciones">
      <h3 id="ubicar-titulo" className="cer-bloque-titulo">
        ¿Dónde queda esta casa? <span className="cer-grupo-n">{porUbicar.length}</span>
      </h3>
      <p className="suave">El sitio no dice claro la zona. Elegirla toma un toque y sirve para calcular el traslado de las visitas.</p>
      <ul className="cer-filas">
        {lista.map((u) => (
          <li key={u.id}>
            <Link href={`/panel/propiedades/${u.casaId}`}>
              <span className="cer-fila-icono tono-ambar" aria-hidden>
                <IconoCasa tamano={20} />
              </span>
              <span className="cer-fila-texto">
                <strong>{u.titulo}</strong>
                <span className="suave">
                  {u.codigo} · el sitio dice «{u.sitio}»
                </span>
              </span>
              <span className="cer-fila-accion">
                Elegir zona <IconoFlecha tamano={16} />
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

function Necesita(d: Calculado) {
  const nada = !d.dudas.length && !d.porUbicar.length && !d.falta.length;
  if (nada) {
    return (
      <div className="cer-pila">
        <section className="cer-al-dia" aria-labelledby="al-dia-titulo">
          <span className="cer-al-dia-icono" aria-hidden>
            <IconoCheck tamano={34} />
          </span>
          <h2 id="al-dia-titulo">Todo al día</h2>
          <p>
            {d.nombre} no tiene preguntas para ti y tiene lo que necesita para contestar. Cuando un cliente pregunte algo que no sabe, aparece aquí
            primero.
          </p>
          <div className="cer-al-dia-acciones">
            <Link href="/panel/cerebro?ver=sabe#ensenar" className="boton primario">
              Enséñale algo más
            </Link>
            <Link href="/panel/probar" className="boton">
              Probarla
            </Link>
          </div>
        </section>
        <Recientes {...d} />
      </div>
    );
  }
  if (!d.dudas.length && !d.porUbicar.length) {
    // Sin preguntas: lo único pendiente es prepararla. Una sola columna, la lista primero.
    return (
      <div className="cer-pila cer-angosta">
        <CabezaSeccion titulo="Lo que necesita de ti" linea={`No tiene preguntas para ti. Para que ${d.nombre} conteste bien, le falta esto:`} />
        <Preparacion {...d} />
        <Recientes {...d} />
      </div>
    );
  }
  const [primera, ...resto] = d.dudas;
  return (
    <div className="cer-dos">
      <div className="cer-pila">
        <CabezaSeccion titulo="Lo que necesita de ti" linea={`Contéstale una vez y desde entonces ${d.nombre} lo sabe.`} />
        {primera && (
          <section className="cer-bloque" aria-labelledby="dudas-titulo" data-patty="cerebro-pestana-preguntas">
            <h3 id="dudas-titulo" className="cer-bloque-titulo">
              No supo contestar esto <span className="cer-grupo-n urgente">{d.dudas.length}</span>
            </h3>
            <FormDuda d={primera} destacada />
            {resto.map((x) => (
              <FormDuda key={x.id} d={x} />
            ))}
          </section>
        )}
        <Ubicaciones porUbicar={d.porUbicar} />
      </div>
      <aside className="cer-pila" aria-label="Para que esté lista">
        <Preparacion {...d} />
        <Recientes {...d} />
      </aside>
    </div>
  );
}

/** Lo que falta de la preparación, cada renglón con su enlace, y la puesta en marcha completa. */
function Preparacion(d: Calculado) {
  const listos = d.lista.filter((r) => r.listo).length;
  return (
    <section className="cer-caja cer-preparacion" aria-labelledby="prep-titulo">
      <div className="cer-prep-cabeza">
        <h3 id="prep-titulo">Para que esté lista</h3>
        <p className="cer-prep-cuenta">
          <strong>{listos}</strong> de {d.lista.length} listos
        </p>
      </div>
      <div className="cer-segmentos" aria-hidden>
        {d.lista.map((r) => (
          <span key={r.clave} className={r.listo ? "listo" : undefined} />
        ))}
      </div>
      {d.falta.length ? (
        <ul className="cer-prep-lista">
          {d.falta.map((r) => (
            <li key={r.clave}>
              <Link href={r.href}>
                <span className="cer-marca" aria-hidden />
                <span className="cer-renglon">
                  <strong>{r.titulo}</strong>
                  <span className="suave">{r.detalle}</span>
                </span>
                <span className="cer-renglon-accion">{r.accion}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="suave cer-prep-ok">Tiene todo lo básico. Solo le faltan tus respuestas.</p>
      )}
      <Link href="/panel/empezar" className="cer-mas" data-patty="cerebro-empezar">
        Ver la puesta en marcha <IconoFlecha tamano={16} />
      </Link>
    </section>
  );
}

/** "Esta semana corregiste 3 respuestas": lo que aprendió de ti hace poco, para darle un vistazo. */
function Recientes(d: Calculado) {
  if (!d.recientes) return null;
  return (
    <Link href="/panel/cerebro?ver=contesta#correcciones" className="cer-caja cer-recientes">
      <span className="cer-fila-icono tono-morado" aria-hidden>
        <IconoLapiz tamano={20} />
      </span>
      <span className="cer-fila-texto">
        <strong>
          Esta semana corregiste {d.recientes} {d.recientes === 1 ? "respuesta" : "respuestas"}
        </strong>
        <span className="suave">Míralas para ver qué aprendió de tu manera de escribir.</span>
      </span>
      <IconoFlecha tamano={18} />
    </Link>
  );
}

// --- 2. Lo que sabe ---------------------------------------------------------------------------------------

function Sabe(d: Calculado) {
  const porCategoria = new Map<string, Sabido[]>();
  for (const k of d.sabe) {
    const c = categoriaDeTema(k.tema, k.respuesta);
    porCategoria.set(c, [...(porCategoria.get(c) ?? []), k]);
  }
  const grupos = CATEGORIAS.map((c) => ({
    clave: c.clave,
    nombre: c.nombre,
    items: porCategoria.get(c.clave) ?? [],
  })).filter((g) => g.items.length);
  const incompletas = d.casas.filter((c) => !c.precio || c.fotos === 0);
  const dias = resumenHorario(d.franjas);
  const temas = grupos.map((g) => g.nombre.toLowerCase());

  return (
    <>
      <CabezaSeccion titulo="Lo que sabe" linea={`Todo lo que ${d.nombre} usa para contestar a tus clientes, según de dónde lo aprendió.`}>
        <Link href="/panel/cerebro?ver=mapa" className="boton" data-patty="cerebro-ver-mapa">
          Verlo como mapa
        </Link>
      </CabezaSeccion>
      <div className="cer-dos cer-dos-sabe">
        <div className="cer-grupos" data-patty="cerebro-pestana-fuentes">
          <Grupo
            id="casas"
            Icono={IconoCasa}
            tono="verde"
            titulo="Tus casas"
            n={d.casas.length}
            resumen={
              !d.casas.length
                ? "Ninguna en oferta todavía"
                : incompletas.length
                  ? `${d.casas.length === 1 ? "1 en oferta" : `${d.casas.length} en oferta`} · ${incompletas.length} sin precio o fotos`
                  : `${d.casas.length === 1 ? "1 en oferta" : `${d.casas.length} en oferta`}, todas con precio y fotos`
            }
          >
            <p className="suave">Contesta con el precio, la zona y los datos de cada ficha. Lo que no esté en la ficha, te lo pregunta.</p>
            {incompletas.length > 0 && (
              <ul className="cer-filas">
                {incompletas.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <Link href={`/panel/propiedades/${c.id}`}>
                      <span className="cer-fila-texto">
                        <strong>{c.titulo}</strong>
                        <span className="suave">{!c.precio && c.fotos === 0 ? "Sin precio ni fotos" : !c.precio ? "Sin precio" : "Sin fotos"}</span>
                      </span>
                      <span className="cer-fila-accion">
                        Completar <IconoFlecha tamano={16} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href={d.casas.length ? "/panel/propiedades" : "/panel/propiedades/nueva"} className="cer-mas">
              {d.casas.length ? "Ver Mis casas" : "Agregar una casa"} <IconoFlecha tamano={16} />
            </Link>
          </Grupo>

          <Grupo
            id="ensenado"
            Icono={IconoIdea}
            tono="azul"
            titulo="Lo que le enseñaste"
            n={d.sabe.length}
            resumen={d.sabe.length ? `De ${temas.join(", ")}` : "Todavía nada: enséñale lo que más te preguntan"}
            abierto
            dataPatty="cerebro-pestana-sabe"
          >
            {d.sabe.length ? (
              <LoQueSabe grupos={grupos} />
            ) : (
              <Vacio Icono={IconoIdea} titulo="Todavía no le has enseñado nada." compacto accion={<a href="#ensenar">Enseñarle lo primero</a>}>
                Empieza por lo que más te preguntan: mascotas, parqueo, formas de pago.
              </Vacio>
            )}
          </Grupo>

          {d.ubicadas.length > 0 && (
            <Grupo
              id="ubicaciones"
              Icono={IconoCasa}
              tono="gris"
              titulo="Ubicaciones confirmadas"
              n={d.ubicadas.length}
              resumen="Dónde queda cada casa del sitio"
            >
              <p className="suave">Se cambian en cada casa.</p>
              <ul className="cer-ubicadas">
                {d.ubicadas.map((u) => (
                  <li key={u.id}>
                    {u.casaId ? <Link href={`/panel/propiedades/${u.casaId}`}>{u.titulo}</Link> : <strong>{u.titulo}</strong>}
                    <span className="suave"> · {u.codigo}</span>
                    <span className="cer-zona">{u.zona}</span>
                  </li>
                ))}
              </ul>
            </Grupo>
          )}

          <Grupo id="horario" Icono={IconoAgenda} tono="ambar" titulo="Tu horario de visitas" resumen={diasDelHorario(dias)}>
            {dias.length ? (
              <dl className="cer-horario">
                {dias.map((x) => (
                  <div key={x.dia}>
                    <dt>{x.dia}</dt>
                    <dd>{x.texto}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="suave">Sin horario no puede ofrecer citas: las visitas te las pasa a ti.</p>
            )}
            <Link href="/panel/agenda/horario" className="cer-mas">
              {dias.length ? "Cambiar en Mi horario" : "Poner horario"} <IconoFlecha tamano={16} />
            </Link>
          </Grupo>
        </div>
        <aside className="cer-lateral" aria-label="Enséñale algo">
          <EnsenaleAlgo nombre={d.nombre} />
        </aside>
      </div>
    </>
  );
}

// --- 3. Cómo contesta -------------------------------------------------------------------------------------

function Contesta(d: Calculado) {
  const ejemplos = d.correcciones.slice(0, 2);
  return (
    <div className="cer-pila">
      <CabezaSeccion titulo="Cómo contesta" linea={`La manera de hablar de ${d.nombre} y lo que no contesta sola.`}>
        <Link href="/panel/probar" className="boton primario cer-probar" data-patty="cerebro-probar">
          <IconoProbar tamano={20} /> Probarla
        </Link>
      </CabezaSeccion>

      <div className="cer-contesta-rejilla">
        <section className="cer-caja cer-tono" aria-labelledby="tono-titulo">
          <p className="cer-sobre">Tu tono</p>
          <h3 id="tono-titulo">Así le pediste que escriba</h3>
          {d.tono.trim() ? (
            <blockquote className="cer-cita">«{d.tono.trim()}»</blockquote>
          ) : (
            <p className="suave">Todavía no le dijiste cómo quieres que escriba.</p>
          )}
          {ejemplos.length > 0 && (
            <>
              <p className="cer-ejemplos-titulo">Y así escribes tú, de tus últimas correcciones:</p>
              <div className="cer-burbujas">
                {ejemplos.map((e) => (
                  <p key={e.id} className="cer-burbuja">
                    {e.corregido.length > 220 ? `${e.corregido.slice(0, 219).trimEnd()}…` : e.corregido}
                  </p>
                ))}
              </div>
            </>
          )}
          <Link href="/panel/ajustes#tono" className="cer-mas">
            {d.tono.trim() ? "Cambiar en Ajustes" : "Decirle cómo escribir"} <IconoFlecha tamano={16} />
          </Link>
        </section>

        <div className="cer-pila">
          <section className={`cer-caja cer-modo ${d.automatica ? "sola" : "espera"}`} aria-labelledby="modo-titulo">
            <p className="cer-sobre">Si contesta sola</p>
            <h3 id="modo-titulo">
              <span className="cer-punto" aria-hidden />
              {d.automatica ? "Contesta sola a tus clientes" : "Espera tu visto bueno"}
            </h3>
            <p className="suave">
              {d.automatica
                ? "Manda sus respuestas al momento. Lo que no sabe o no le toca, te lo pasa."
                : "Te deja cada respuesta lista en Revisar; sale cuando la apruebas."}
            </p>
            <Link href="/panel/ajustes" className="cer-mas">
              Cambiar en Ajustes <IconoFlecha tamano={16} />
            </Link>
          </section>

          <section className="cer-caja cer-temas" aria-labelledby="temas-titulo">
            <p className="cer-sobre">Lo que te pasa a ti</p>
            <h3 id="temas-titulo">No lo contesta: te avisa</h3>
            {d.temas.length ? (
              <ul className="cer-chips">
                {d.temas.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="suave">Ningún tema: lo contesta todo. Agrega los que prefieres hablar tú (precio, comisiones, ofertas).</p>
            )}
            <Link href="/panel/ajustes#reglas" className="cer-mas">
              {d.temas.length ? "Cambiar en Ajustes" : "Elegir temas"} <IconoFlecha tamano={16} />
            </Link>
          </section>
        </div>
      </div>

      <Correcciones {...d} />
    </div>
  );
}

function Marcado({ partes, clase }: { partes: Parte[]; clase: "quitado" | "puesto" }) {
  return (
    <>
      {partes.map((p, i) =>
        p.cambio ? clase === "quitado" ? <del key={i}>{p.texto}</del> : <ins key={i}>{p.texto}</ins> : <span key={i}>{p.texto}</span>,
      )}
    </>
  );
}

function TarjetaCorreccion({ c, enUso }: { c: Correccion; enUso: boolean }) {
  const dif = diferenciaPalabras(c.original, c.corregido);
  return (
    <article className="cer-caja cer-correccion">
      <p className="cer-correccion-pie">
        <span className="suave">{fechaCorta(c.created_at.slice(0, 10))}</span>
        {enUso && <span className="cer-en-uso">La usa al contestar</span>}
      </p>
      <div className="cer-antes-despues">
        <div className="cer-antes">
          <p className="cer-sobre">Lo que propuso</p>
          <p>
            <Marcado partes={dif.antes} clase="quitado" />
          </p>
        </div>
        <div className="cer-despues">
          <p className="cer-sobre">Como la mandaste tú</p>
          <p>
            <Marcado partes={dif.despues} clase="puesto" />
          </p>
        </div>
      </div>
    </article>
  );
}

function Correcciones(d: Calculado) {
  return (
    <section
      id="correcciones"
      className="cer-bloque cer-correcciones"
      aria-labelledby="correcciones-titulo"
      data-patty="cerebro-pestana-correcciones"
    >
      <h3 id="correcciones-titulo" className="cer-bloque-titulo">
        Tus correcciones {d.correcciones.length > 0 && <span className="cer-grupo-n">{d.correcciones.length}</span>}
      </h3>
      <p className="suave">Aprende tu manera de decir las cosas de tus últimas {CORRECCIONES_EN_USO} correcciones. Marcado, lo que cambiaste.</p>
      {d.correcciones.length ? (
        d.correcciones.map((c, i) => <TarjetaCorreccion key={c.id} c={c} enUso={i < CORRECCIONES_EN_USO} />)
      ) : (
        <Vacio Icono={IconoLapiz} titulo="Todavía no has corregido ninguna respuesta." compacto>
          Cuando cambies una respuesta antes de enviarla (en Revisar o al probarla), aparece aquí. Así aprende tu forma de escribir.
        </Vacio>
      )}
    </section>
  );
}

// --- Mapa -------------------------------------------------------------------------------------------------

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const LEYENDA: { tono: Rama["tono"]; texto: string }[] = [
  { tono: "verde", texto: "Casas" },
  { tono: "azul", texto: "Lo que sabe" },
  { tono: "ambar", texto: "Lo que todavía no sabe" },
  { tono: "morado", texto: "Tus correcciones" },
  { tono: "gris", texto: "Horario y temas que van a ti" },
];

function Mapa(d: DatosCerebro) {
  const ramas: Rama[] = [
    {
      clave: "casas",
      nombre: "Casas",
      href: "/panel/propiedades",
      tono: "verde",
      hojas: d.casas.map((c) => ({
        texto: c.titulo,
        href: `/panel/propiedades/${c.id}`,
      })),
    },
    {
      clave: "sabe",
      nombre: "Lo que sabe",
      href: "/panel/cerebro?ver=sabe",
      tono: "azul",
      hojas: d.sabe.map((k) => ({
        texto: k.tema,
        href: "/panel/cerebro?ver=sabe",
      })),
    },
    {
      clave: "dudas",
      nombre: "Preguntas",
      href: "/panel/cerebro?ver=necesita",
      tono: "ambar",
      hojas: [
        ...d.dudas.map((x) => ({
          texto: x.tema,
          href: "/panel/cerebro?ver=necesita",
        })),
        ...d.porUbicar.map((u) => ({
          texto: `¿Dónde queda ${u.titulo}?`,
          href: `/panel/propiedades/${u.casaId}`,
        })),
      ],
    },
    {
      clave: "correcciones",
      nombre: "Correcciones",
      href: "/panel/cerebro?ver=contesta#correcciones",
      tono: "morado",
      hojas: d.correcciones.slice(0, CORRECCIONES_EN_USO).map((e) => ({
        texto: e.corregido,
        href: "/panel/cerebro?ver=contesta#correcciones",
      })),
    },
    {
      clave: "horario",
      nombre: "Horario",
      href: "/panel/agenda/horario",
      tono: "gris",
      hojas: d.franjas.map((f) => ({
        texto: `${DIAS[f.dia_semana]} ${f.hora_inicio.slice(0, 5)}–${f.hora_fin.slice(0, 5)}`,
        href: "/panel/agenda/horario",
      })),
    },
    {
      clave: "temas",
      nombre: "Te los pasa",
      href: "/panel/ajustes",
      tono: "gris",
      hojas: d.temas.map((t) => ({ texto: t, href: "/panel/ajustes" })),
    },
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
        <Link href="/panel/cerebro?ver=sabe" className="boton cer-cerrar" data-patty="cerebro-cerrar-mapa">
          Cerrar
        </Link>
      </header>
      <MapaCerebro ramas={ramas} />
    </section>
  );
}
