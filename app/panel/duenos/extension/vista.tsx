// Lo que se ve al instalar la extensión: el asistente paso a paso, el de "versión anterior", la tarjeta de
// estado y las pantallas de teléfono y de otro navegador. Solo forma: el estado y las acciones llegan por props
// (los maneja asistente.tsx), así se puede dibujar cada caso sin navegador.

import {
  direccionExtensiones,
  haceDias,
  nombreNavegador,
  numeroDePaso,
  PASOS,
  PASOS_ACTUALIZAR,
  type EstadoExtension,
  type Navegador,
  type Paso,
  type PasoActualizar,
} from "@/lib/panel/extension-instalar";
import { IconoAtras, IconoCheck, IconoFlecha } from "../../iconos";
import {
  IlusAbrirBarra,
  IlusAbrirMenu,
  IlusCargarDescomprimida,
  IlusComputadora,
  IlusConectar,
  IlusDescargar,
  IlusDescomprimirMac,
  IlusDescomprimirWindows,
  IlusFijar,
  IlusModoDesarrollador,
  IlusRecargar,
  IlusReemplazar,
} from "./ilustraciones";

export const ZIP = "/extension/buscador-duenos.zip";
export const ARCHIVO = "buscador-duenos.zip";
export const CARPETA = "buscador-duenos";

export type Conexion =
  | { fase: "nada" }
  | { fase: "conectando" }
  | { fase: "lista"; corredor: string }
  | { fase: "error"; mensaje: string };

// --- Tarjeta de estado -----------------------------------------------------------------------------------

type Tono = "verde" | "ambar" | "gris";

export function textoEstado(e: EstadoExtension, conexion: Conexion, demo: boolean): { tono: Tono; titulo: string; detalle: string } {
  if (demo) return { tono: "gris", titulo: "Demo: no se conecta de verdad", detalle: "Puedes recorrer la instalación para ver cómo es." };
  if (conexion.fase === "conectando") return { tono: "ambar", titulo: "Conectando…", detalle: "Un momento: la extensión está pidiendo su permiso." };
  switch (e.tipo) {
    case "buscando":
      return { tono: "gris", titulo: "Buscando la extensión…", detalle: "Revisando si está en este navegador." };
    case "conectada":
      return {
        tono: "verde",
        titulo: e.corredor ? `Instalada y conectada a ${e.corredor}` : "Instalada y conectada",
        detalle: `${haceDias(e.ultimaBusquedaDias).replace(/^./, (c) => c.toUpperCase())}. Busca sola cada semana con Chrome abierto.`,
      };
    case "sin_conectar":
      return { tono: "ambar", titulo: "Instalada pero sin conectar", detalle: "Falta un toque para que trabaje con tu panel." };
    case "nueva_version":
      return { tono: "ambar", titulo: `Hay una versión nueva (${e.version})`, detalle: "Actualízala: son tres pasos y no pierdes nada." };
    case "vieja":
      return {
        tono: "ambar",
        titulo: "Conectada, pero no la veo en este navegador",
        detalle: "Si la instalaste en esta computadora, es una versión anterior: actualízala para que se conecte sola.",
      };
    case "no_instalada":
      return { tono: "gris", titulo: "No la veo en este navegador", detalle: "Se instala una sola vez, en tu computadora." };
    case "sin_conectar_servidor":
      return { tono: "gris", titulo: "Todavía no está conectada", detalle: "Se instala una sola vez, en tu computadora." };
  }
}

export function TarjetaEstado({
  estado,
  conexion,
  demo,
  children,
}: {
  estado: EstadoExtension;
  conexion: Conexion;
  demo: boolean;
  /** El botón que corresponde (Conectar, Instalar, Actualizar, Desconectar…). */
  children?: React.ReactNode;
}) {
  const t = textoEstado(estado, conexion, demo);
  return (
    <div className="ext-estado" data-tono={t.tono} role="status" aria-live="polite" data-patty="extension-estado">
      <span className="ext-estado-punto" aria-hidden>
        {t.tono === "verde" ? <IconoCheck tamano={18} /> : null}
      </span>
      <div className="ext-estado-texto">
        <strong>{t.titulo}</strong>
        <span>{t.detalle}</span>
      </div>
      {children && <div className="ext-estado-acciones">{children}</div>}
    </div>
  );
}

// --- Piezas del asistente ----------------------------------------------------------------------------------

const NOMBRES_PASO: Record<Exclude<Paso, "listo">, string> = {
  descargar: "Descargar",
  descomprimir: "Abrir el archivo",
  abrir: "Extensiones",
  cargar: "Ponerla en Chrome",
  conectar: "Conectar",
};

function Progreso({ paso, alElegir }: { paso: Paso; alElegir: (p: Paso) => void }) {
  const { numero, total } = numeroDePaso(paso);
  const actual = PASOS.indexOf(paso);
  return (
    <nav className="ext-progreso" aria-label="Pasos para instalar la extensión">
      <p className="ext-progreso-cuenta">{paso === "listo" ? "Todo listo" : `Paso ${numero} de ${total}`}</p>
      <ol>
        {PASOS.filter((p): p is Exclude<Paso, "listo"> => p !== "listo").map((p, i) => {
          const hecho = i < actual;
          return (
            <li key={p} data-estado={hecho ? "hecho" : i === actual ? "actual" : "falta"}>
              <button type="button" onClick={() => alElegir(p)} aria-current={i === actual ? "step" : undefined} disabled={i > actual} data-patty={`extension-paso-${p}`}>
                <span className="ext-progreso-num" aria-hidden>
                  {hecho ? <IconoCheck tamano={16} /> : i + 1}
                </span>
                <span className="ext-progreso-nombre">{NOMBRES_PASO[p]}</span>
                {hecho && <span className="solo-lector"> (hecho)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Ayuda({ items }: { items: { p: string; r: React.ReactNode }[] }) {
  return (
    <details className="ext-ayuda" data-patty="extension-ayuda">
      <summary>¿No te sale así?</summary>
      <dl>
        {items.map((i) => (
          <div key={i.p}>
            <dt>{i.p}</dt>
            <dd>{i.r}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Botonera({
  alAtras,
  alSiguiente,
  textoSiguiente = "Ya lo hice, siguiente",
  siguientePrincipal = false,
}: {
  alAtras?: () => void;
  alSiguiente?: () => void;
  textoSiguiente?: string;
  siguientePrincipal?: boolean;
}) {
  return (
    <div className="ext-botonera">
      {alAtras ? (
        <button type="button" className="ext-atras" onClick={alAtras} data-patty="extension-atras">
          <IconoAtras tamano={18} />
          Atrás
        </button>
      ) : (
        <span />
      )}
      {alSiguiente && (
        <button type="button" className={siguientePrincipal ? "primario ext-siguiente" : "ext-siguiente"} onClick={alSiguiente} data-patty="extension-siguiente">
          {textoSiguiente}
          <IconoFlecha tamano={18} />
        </button>
      )}
    </div>
  );
}

function Paso({ titulo, children, ilustracion }: { titulo: string; children: React.ReactNode; ilustracion: React.ReactNode; numero?: number }) {
  return (
    <section className="ext-paso" aria-labelledby="ext-paso-titulo">
      <div className="ext-paso-texto">
        <h2 id="ext-paso-titulo" tabIndex={-1}>
          {titulo}
        </h2>
        {children}
      </div>
      <div className="ext-paso-dibujo">{ilustracion}</div>
    </section>
  );
}

function Direccion({ direccion, copiada, alCopiar }: { direccion: string; copiada: boolean; alCopiar: () => void }) {
  return (
    <div className="ext-direccion">
      <code>{direccion}</code>
      <button type="button" className="primario" onClick={alCopiar} data-patty="extension-copiar">
        {copiada ? "Copiada" : "Copiar la dirección"}
      </button>
      <span className="solo-lector" aria-live="polite">
        {copiada ? "Dirección copiada" : ""}
      </span>
    </div>
  );
}

const menuDe = (n: Navegador) =>
  n === "edge" ? { extensiones: "Extensiones", gestionar: "Administrar extensiones" } : { extensiones: "Extensiones", gestionar: "Gestionar extensiones" };

// --- El asistente ------------------------------------------------------------------------------------------

export interface AccionesAsistente {
  elegir(p: Paso): void;
  siguiente(): void;
  atras(): void;
  descargar(): void;
  elegirSistema(s: "windows" | "mac"): void;
  copiar(): void;
  conectar(): void;
  recargar(): void;
  empezarDeNuevo(): void;
  actualizar(): void;
}

export interface PropsAsistente {
  paso: Paso;
  estado: EstadoExtension;
  conexion: Conexion;
  navegador: Navegador;
  sistema: "windows" | "mac";
  demo: boolean;
  version: string;
  copiada: boolean;
  acciones: AccionesAsistente;
  /** El método a mano (pedir el código y escribirlo en la extensión), de respaldo. */
  manual: React.ReactNode;
}

export function Asistente(p: PropsAsistente) {
  const { paso, acciones: a, navegador } = p;
  const dir = direccionExtensiones(navegador);
  const nav = nombreNavegador(navegador);
  const { numero } = numeroDePaso(paso);
  return (
    <div className="ext-asistente" data-paso={paso}>
      <Progreso paso={paso} alElegir={a.elegir} />
      <div className="ext-tarjeta">
        {paso === "descargar" && (
          <Paso titulo="Descarga la extensión" numero={numero} ilustracion={<IlusDescargar />}>
            <p className="ext-instruccion">
              Toca el botón verde. Se descarga un archivo llamado <strong>{ARCHIVO}</strong> a tu carpeta <strong>Descargas</strong>.
            </p>
            <a href={ZIP} download className="boton primario grande ext-accion" onClick={a.descargar} data-patty="extension-descargar">
              Descargar la extensión
            </a>
            <p className="suave">Versión {p.version}. Se instala una sola vez.</p>
            <Ayuda
              items={[
                { p: "No veo el archivo", r: <>Abre la carpeta Descargas de tu computadora. En {nav} también está en el menú de los tres puntos, en Descargas.</> },
                { p: `${nav} dice que el archivo puede ser peligroso`, r: <>Toca Conservar. Es la extensión de tu asistente y viene de tu propio panel.</> },
                {
                  p: "Ya la tenía instalada",
                  r: (
                    <>
                      Entonces solo hay que actualizarla.{" "}
                      <button type="button" className="enlace" onClick={a.actualizar}>
                        Ver cómo se actualiza
                      </button>
                    </>
                  ),
                },
              ]}
            />
          </Paso>
        )}

        {paso === "descomprimir" && (
          <Paso
            titulo="Abre el archivo"
            numero={numero}
            ilustracion={p.sistema === "mac" ? <IlusDescomprimirMac /> : <IlusDescomprimirWindows />}
          >
            <div className="ext-sistema" role="group" aria-label="Tu computadora">
              <button type="button" aria-pressed={p.sistema === "windows"} onClick={() => a.elegirSistema("windows")} data-patty="extension-windows">
                Tengo Windows
              </button>
              <button type="button" aria-pressed={p.sistema === "mac"} onClick={() => a.elegirSistema("mac")} data-patty="extension-mac">
                Tengo Mac
              </button>
            </div>
            {p.sistema === "mac" ? (
              <p className="ext-instruccion">
                Abre tu carpeta <strong>Descargas</strong> y haz <strong>doble clic</strong> en <strong>{ARCHIVO}</strong>. Al lado aparece una
                carpeta llamada <strong>{CARPETA}</strong>.
              </p>
            ) : (
              <p className="ext-instruccion">
                Abre tu carpeta <strong>Descargas</strong>, haz <strong>clic derecho</strong> sobre <strong>{ARCHIVO}</strong> y elige{" "}
                <strong>Extraer todo…</strong> Luego toca <strong>Extraer</strong>. Queda una carpeta llamada <strong>{CARPETA}</strong>.
              </p>
            )}
            <p className="ext-nota">Esa carpeta se queda en tu computadora: si la borras, la extensión deja de funcionar. Si quieres, muévela a Documentos.</p>
            <Botonera alAtras={a.atras} alSiguiente={a.siguiente} />
            <Ayuda
              items={[
                {
                  p: p.sistema === "mac" ? "No pasa nada al hacer doble clic" : "No sale «Extraer todo…»",
                  r:
                    p.sistema === "mac" ? (
                      <>Haz clic derecho sobre el archivo y elige Abrir con, y luego Utilidad de Archivo.</>
                    ) : (
                      <>Haz doble clic en el archivo: se abre y adentro está la carpeta {CARPETA}. Arrástrala a Documentos.</>
                    ),
                },
                { p: `Quedó una carpeta ${CARPETA} dentro de otra igual`, r: <>Está bien. En el paso 4 elige la de adentro, la que tiene los archivos.</> },
                { p: "Dice que ya existe una carpeta con ese nombre", r: <>Ya la habías descargado antes. Elige reemplazarla.</> },
              ]}
            />
          </Paso>
        )}

        {paso === "abrir" && (
          <Paso titulo={`Abre las extensiones de ${nav}`} numero={numero} ilustracion={<IlusAbrirBarra direccion={dir} />}>
            <p className="ext-instruccion">
              Copia esta dirección, ábrela en una <strong>pestaña nueva</strong> (pégala en la barra de arriba) y presiona <strong>Enter</strong>.
            </p>
            <Direccion direccion={dir} copiada={p.copiada} alCopiar={a.copiar} />
            <p className="ext-nota">{nav} no deja abrir esta página con un botón: por seguridad hay que pegar la dirección. Deja esta pestaña abierta para volver.</p>
            <details className="ext-otra-forma">
              <summary>O llega por el menú</summary>
              <p>
                Toca los <strong>tres puntos</strong> de arriba a la derecha, luego <strong>{menuDe(navegador).extensiones}</strong> y{" "}
                <strong>{menuDe(navegador).gestionar}</strong>.
              </p>
              <IlusAbrirMenu {...menuDe(navegador)} />
            </details>
            <Botonera alAtras={a.atras} alSiguiente={a.siguiente} />
            <Ayuda
              items={[
                { p: "Al presionar Enter sale una búsqueda", r: <>Revisa que diga exactamente {dir}, sin espacios, y vuelve a presionar Enter.</> },
                { p: "Es la computadora del trabajo y no me deja", r: <>Algunas empresas bloquean las extensiones. Pídele permiso a quien maneja esa computadora, o usa la tuya.</> },
              ]}
            />
          </Paso>
        )}

        {paso === "cargar" && (
          <Paso
            titulo={`Ponla en ${nav}`}
            numero={numero}
            ilustracion={
              <>
                <IlusModoDesarrollador direccion={dir} />
                <IlusCargarDescomprimida direccion={dir} />
              </>
            }
          >
            <ol className="ext-subpasos">
              <li>
                Arriba a la derecha, enciende <strong>Modo de desarrollador</strong>.
              </li>
              <li>
                Arriba a la izquierda aparece <strong>Cargar descomprimida</strong>: tócalo y elige la carpeta <strong>{CARPETA}</strong>.
              </li>
            </ol>
            <p className="ext-nota ext-nota-verde">Cuando la cargues, vuelve a esta pestaña: la página se da cuenta sola y sigue.</p>
            <Botonera alAtras={a.atras} alSiguiente={a.siguiente} />
            <Ayuda
              items={[
                { p: "No veo «Cargar descomprimida»", r: <>Aparece al encender Modo de desarrollador, arriba a la derecha.</> },
                {
                  p: "Dice que no encuentra el archivo de manifiesto",
                  r: <>Elegiste el archivo .zip o la carpeta de afuera. Elige la carpeta {CARPETA} que tiene los archivos adentro.</>,
                },
                { p: "Sale un aviso sobre extensiones en modo de desarrollador", r: <>Es normal. Ciérralo y no la desactives.</> },
              ]}
            />
          </Paso>
        )}

        {paso === "conectar" && <PasoConectar {...p} numero={numero} />}

        {paso === "listo" && (
          <section className="ext-listo" aria-labelledby="ext-paso-titulo">
            <span className="ext-listo-check" aria-hidden>
              <IconoCheck tamano={34} />
            </span>
            <h2 id="ext-paso-titulo" tabIndex={-1}>
              ¡Listo! Ya está conectada
            </h2>
            <p className="ext-instruccion">Desde ahora la extensión trabaja para ti en {nav}.</p>
            <div className="ext-listo-grilla">
              <div className="ext-listo-item">
                <h3>Busca sola cada semana</h3>
                <p>Mientras {nav} esté abierto, una vez por semana abre Encuentra24 en una pestaña de fondo y los dueños aparecen en Dueños directos.</p>
                <p>
                  Busca a tu ritmo, como lo harías tú: lee cada página, hace pausas y no abre más de una pestaña. Si Encuentra24 te pide confirmar que
                  eres tú, se detiene y te avisa.
                </p>
              </div>
              <div className="ext-listo-item">
                <h3>Leer este anuncio</h3>
                <p>
                  Abre el anuncio de una casa en Encuentra24, toca la extensión y luego <strong>Leer este anuncio</strong>: la casa llega a Mis casas,
                  pausada para que la revises.
                </p>
              </div>
              <div className="ext-listo-item ext-listo-fijar">
                <div>
                  <h3>Tenla a mano</h3>
                  <p>
                    Toca la <strong>pieza de rompecabezas</strong> junto a la barra de direcciones y luego el alfiler de{" "}
                    <strong>Buscador de dueños</strong> para fijarla.
                  </p>
                </div>
                <IlusFijar />
              </div>
            </div>
            <div className="ext-listo-fin">
              <a href="/panel/duenos" className="boton primario grande ext-accion" data-patty="extension-volver">
                Volver a Dueños directos
              </a>
              <button type="button" className="enlace" onClick={a.empezarDeNuevo} data-patty="extension-empezar">
                Empezar de nuevo
              </button>
            </div>
          </section>
        )}
      </div>
      {paso !== "listo" && paso !== "descargar" && (
        <p className="ext-empezar">
          <button type="button" className="enlace" onClick={a.empezarDeNuevo} data-patty="extension-empezar">
            Empezar de nuevo
          </button>
        </p>
      )}
    </div>
  );
}

function PasoConectar(p: PropsAsistente & { numero: number }) {
  const { estado, conexion, acciones: a, demo } = p;
  const conectada = conexion.fase === "lista" || estado.tipo === "conectada";
  const corredor = conexion.fase === "lista" ? conexion.corredor : estado.tipo === "conectada" ? estado.corredor : "";
  const instalada = estado.tipo === "sin_conectar" || estado.tipo === "nueva_version" || estado.tipo === "conectada";
  let cuerpo: React.ReactNode;
  if (conectada) {
    cuerpo = (
      <>
        <p className="ext-exito" role="status">
          <span aria-hidden>
            <IconoCheck tamano={22} />
          </span>
          {corredor ? `Conectada a ${corredor}` : "Conectada"}
          {demo ? " (de muestra)" : ""}
        </p>
        <p className="ext-instruccion">Ya puede buscar dueños por ti. Falta ver qué hace y cómo tenerla a mano.</p>
        <Botonera alAtras={a.atras} alSiguiente={a.siguiente} textoSiguiente="Terminar" siguientePrincipal />
      </>
    );
  } else if (conexion.fase === "conectando") {
    cuerpo = (
      <p className="ext-cargando" role="status">
        <span className="ext-girando" aria-hidden />
        Conectando…
      </p>
    );
  } else if (demo) {
    cuerpo = (
      <>
        <p className="ext-instruccion">
          En tu cuenta, al volver a esta pestaña con la extensión cargada, se conecta sola. En la demo no se conecta de verdad: mira cómo se vería.
        </p>
        <button type="button" className="primario grande ext-accion" onClick={a.conectar} data-patty="extension-conectar">
          Ver cómo se conecta
        </button>
        <Botonera alAtras={a.atras} />
      </>
    );
  } else if (instalada) {
    cuerpo = (
      <>
        {conexion.fase === "error" && (
          <p className="aviso" role="alert">
            {conexion.mensaje}
          </p>
        )}
        <p className="ext-instruccion">La extensión ya está en {nombreNavegador(p.navegador)}. Falta conectarla a tu panel: es un toque.</p>
        <button type="button" className="primario grande ext-accion" onClick={a.conectar} data-patty="extension-conectar">
          {conexion.fase === "error" ? "Intentar otra vez" : "Conectar ahora"}
        </button>
        <Botonera alAtras={a.atras} />
      </>
    );
  } else if (estado.tipo === "buscando") {
    cuerpo = (
      <p className="ext-cargando" role="status">
        <span className="ext-girando" aria-hidden />
        Buscando la extensión…
      </p>
    );
  } else {
    cuerpo = (
      <>
        <p className="ext-instruccion">
          Todavía no la veo en {nombreNavegador(p.navegador)}. Si ya tocaste <strong>Cargar descomprimida</strong> y elegiste la carpeta, recarga esta página.
        </p>
        <button type="button" className="primario grande ext-accion" onClick={a.recargar} data-patty="extension-recargar">
          Recargar la página
        </button>
        <Botonera alAtras={a.atras} />
      </>
    );
  }
  return (
    <Paso titulo="Conéctala a tu panel" numero={p.numero} ilustracion={<IlusConectar conectada={conectada} version={p.version} />}>
      {cuerpo}
      {!conectada && (
        <details className="ext-manual" data-patty="extension-manual">
          <summary>¿No se conectó sola? Hazlo a mano</summary>
          <ol className="ext-subpasos">
            <li>
              Toca la <strong>pieza de rompecabezas</strong> junto a la barra de direcciones y abre <strong>Buscador de dueños</strong>.
            </li>
            <li>Pide un código aquí abajo y escríbelo en la extensión (vale 10 minutos).</li>
          </ol>
          {p.manual}
        </details>
      )}
    </Paso>
  );
}

// --- Actualizar (versión anterior) ------------------------------------------------------------------------

export interface PropsActualizar {
  paso: PasoActualizar;
  estado: EstadoExtension;
  navegador: Navegador;
  sistema: "windows" | "mac";
  copiada: boolean;
  version: string;
  acciones: {
    elegir(p: PasoActualizar): void;
    copiar(): void;
    recargar(): void;
    esPrimeraVez(): void;
  };
}

const NOMBRES_ACTUALIZAR: Record<PasoActualizar, string> = { descargar: "Descargar la nueva", reemplazar: "Reemplazar la carpeta", recargar: "Volver a cargarla" };

export function Actualizar(p: PropsActualizar) {
  const { paso, acciones: a } = p;
  const i = PASOS_ACTUALIZAR.indexOf(paso);
  const dir = direccionExtensiones(p.navegador);
  const nav = nombreNavegador(p.navegador);
  const ir = (d: number) => a.elegir(PASOS_ACTUALIZAR[Math.min(Math.max(i + d, 0), PASOS_ACTUALIZAR.length - 1)]);
  return (
    <div className="ext-asistente ext-actualizar" data-paso={paso}>
      <div className="ext-actualizar-cabeza">
        <h2>{p.estado.tipo === "nueva_version" ? "Actualízala en tres pasos" : "Tienes una versión anterior"}</h2>
        <p>
          La versión {p.version} se conecta sola con tu panel. Son tres pasos y no pierdes nada: sigue conectada y con tus búsquedas.
        </p>
      </div>
      <nav className="ext-progreso" aria-label="Pasos para actualizar">
        <p className="ext-progreso-cuenta">{`Paso ${i + 1} de 3`}</p>
        <ol>
          {PASOS_ACTUALIZAR.map((q, j) => (
            <li key={q} data-estado={j < i ? "hecho" : j === i ? "actual" : "falta"}>
              <button type="button" onClick={() => a.elegir(q)} aria-current={j === i ? "step" : undefined} disabled={j > i}>
                <span className="ext-progreso-num" aria-hidden>
                  {j < i ? <IconoCheck tamano={16} /> : j + 1}
                </span>
                <span className="ext-progreso-nombre">{NOMBRES_ACTUALIZAR[q]}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="ext-tarjeta">
        {paso === "descargar" && (
          <Paso titulo="Descarga la versión nueva" numero={1} ilustracion={<IlusDescargar />}>
            <p className="ext-instruccion">
              Toca el botón verde. Llega otra vez <strong>{ARCHIVO}</strong> a tu carpeta Descargas.
            </p>
            <a href={ZIP} download className="boton primario grande ext-accion" onClick={() => setTimeout(() => ir(1), 700)} data-patty="extension-descargar">
              Descargar la versión {p.version}
            </a>
            <Botonera alSiguiente={() => ir(1)} />
          </Paso>
        )}
        {paso === "reemplazar" && (
          <Paso titulo="Reemplaza la carpeta" numero={2} ilustracion={<IlusReemplazar />}>
            <p className="ext-instruccion">
              {p.sistema === "mac" ? (
                <>Haz doble clic en el archivo nuevo. </>
              ) : (
                <>Haz clic derecho sobre el archivo nuevo y elige Extraer todo. </>
              )}
              Pon la carpeta nueva <strong>{CARPETA}</strong> en el mismo lugar donde estaba la anterior y elige <strong>Reemplazar</strong>.
            </p>
            <p className="ext-nota">¿No te acuerdas dónde estaba? En {dir}, en la tarjeta de Buscador de dueños, toca Detalles: abajo dice de dónde se cargó.</p>
            <Botonera alAtras={() => ir(-1)} alSiguiente={() => ir(1)} />
          </Paso>
        )}
        {paso === "recargar" && (
          <Paso titulo="Vuelve a cargarla" numero={3} ilustracion={<IlusRecargar direccion={dir} />}>
            <p className="ext-instruccion">
              Abre {nav} en <strong>{dir}</strong>, busca la tarjeta de <strong>Buscador de dueños</strong> y toca la <strong>flecha circular</strong>.
            </p>
            <Direccion direccion={dir} copiada={p.copiada} alCopiar={a.copiar} />
            <p className="ext-nota ext-nota-verde">Luego vuelve a esta pestaña: se da cuenta sola. Si no cambia, recárgala.</p>
            <div className="ext-botonera">
              <button type="button" className="ext-atras" onClick={() => ir(-1)}>
                <IconoAtras tamano={18} />
                Atrás
              </button>
              <button type="button" className="primario" onClick={a.recargar} data-patty="extension-recargar">
                Recargar la página
              </button>
            </div>
          </Paso>
        )}
      </div>
      {p.estado.tipo === "vieja" && (
        <p className="ext-empezar">
          ¿Nunca la instalaste en esta computadora?{" "}
          <button type="button" className="enlace" onClick={a.esPrimeraVez} data-patty="extension-primera-vez">
            Instalarla desde el principio
          </button>
        </p>
      )}
    </div>
  );
}

// --- Cuando aquí no se puede instalar -------------------------------------------------------------------

export function PantallaOtroAparato({
  tipo,
  navegador,
  enlace,
  copiado,
  puedeCompartir,
  alCompartir,
  alCopiar,
}: {
  tipo: "movil" | "otro_navegador";
  navegador: Navegador;
  enlace: string;
  copiado: boolean;
  puedeCompartir: boolean;
  alCompartir: () => void;
  alCopiar: () => void;
}) {
  const movil = tipo === "movil";
  return (
    <section className="ext-otro" aria-labelledby="ext-otro-titulo">
      <div className="ext-otro-dibujo">
        <IlusComputadora />
      </div>
      <h2 id="ext-otro-titulo">{movil ? "Esto se hace una sola vez en tu computadora" : "La extensión funciona en Google Chrome"}</h2>
      <p className="ext-instruccion">
        {movil
          ? "La búsqueda de dueños corre en Chrome de tu computadora, no en el teléfono. Mándate este enlace y ábrelo allá: la instalación te lleva paso a paso."
          : `Estás usando ${nombreNavegador(navegador)}, que no carga esta extensión. Abre esta misma página en Chrome (también sirven Edge o Brave) en tu computadora.`}
      </p>
      <div className="ext-enlace">
        <code>{enlace}</code>
      </div>
      <div className="ext-otro-botones">
        {movil && puedeCompartir && (
          <button type="button" className="primario grande" onClick={alCompartir} data-patty="extension-enviar">
            Enviarme el enlace
          </button>
        )}
        <button type="button" className={movil && puedeCompartir ? "grande" : "primario grande"} onClick={alCopiar} data-patty="extension-copiar-enlace">
          {copiado ? "Enlace copiado" : "Copiar el enlace"}
        </button>
      </div>
      <span className="solo-lector" aria-live="polite">
        {copiado ? "Enlace copiado" : ""}
      </span>
      {!movil && (
        <p className="suave">
          ¿No tienes Chrome? Se descarga gratis en <a href="https://www.google.com/chrome/">google.com/chrome</a>.
        </p>
      )}
    </section>
  );
}
