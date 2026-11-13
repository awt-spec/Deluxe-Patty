// Dibujos de lo que la corredora va a ver en Chrome, paso a paso. Maquetas simplificadas (sin capturas ni
// logos), con las palabras tal como salen en Chrome en español, la zona que se toca con un halo verde y el
// cursor encima. Todo en SVG: se ven nítidos en cualquier pantalla y no pesan.

import { useId } from "react";

const VERDE = "#00a884";
const VERDE_OSCURO = "#008069";
const TEXTO = "#1f2328";
const SUAVE = "#5f6b76";
const LINEA = "#d5dbe0";
const GRIS = "#eef1f4";
const AZUL = "#0b57d0";

type Svg = { titulo: string; children: React.ReactNode; alto?: number };

/** Lienzo de cada dibujo: 520 de ancho, con su descripción para lectores de pantalla. */
function Lienzo({ titulo, children, alto = 340 }: Svg) {
  const id = useId();
  return (
    <svg className="ilus" viewBox={`0 0 520 ${alto}`} role="img" aria-labelledby={`${id}-t`} focusable="false">
      <title id={`${id}-t`}>{titulo}</title>
      {children}
    </svg>
  );
}

/** Halo verde alrededor de lo que hay que tocar (late suave, salvo con "reducir movimiento"). */
function Halo({ x, y, w, h, r = 8 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <g>
      <rect className="ilus-halo" x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx={r + 6} fill={VERDE} opacity={0.16} />
      <rect x={x - 2.5} y={y - 2.5} width={w + 5} height={h + 5} rx={r + 2.5} fill="none" stroke={VERDE} strokeWidth={2.5} />
    </g>
  );
}

/** Flecha del mouse, con la punta en (x, y). */
function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <path
      transform={`translate(${x} ${y})`}
      d="M0 0 L0 21 L5.5 16 L9.5 25 L13.5 23.2 L9.6 14.5 L16.5 14.2 Z"
      fill={TEXTO}
      stroke="#fff"
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  );
}

/** Pieza de rompecabezas (el botón de extensiones de Chrome). */
function Rompecabezas({ x, y, color = SUAVE }: { x: number; y: number; color?: string }) {
  return (
    <path
      transform={`translate(${x} ${y})`}
      d="M2 6h4a2.5 2.5 0 1 1 5 0h4v4a2.5 2.5 0 1 1 0 5v4h-4a2.5 2.5 0 1 0-5 0H2v-4a2.5 2.5 0 1 0 0-5z"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  );
}

function Archivo({ x, y, zip = true, escala = 1 }: { x: number; y: number; zip?: boolean; escala?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <path d="M0 4a4 4 0 0 1 4-4h20l12 12v36a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z" fill="#fff" stroke="#9aa6b1" strokeWidth={1.5} />
      <path d="M24 0v8a4 4 0 0 0 4 4h8" fill="none" stroke="#9aa6b1" strokeWidth={1.5} />
      {zip && (
        <>
          <path d="M14 4h4M14 9h4M14 14h4M14 19h4" stroke="#7c8a96" strokeWidth={2.2} />
          <rect x={11} y={23} width={10} height={9} rx={2} fill="#7c8a96" />
        </>
      )}
    </g>
  );
}

function Carpeta({ x, y, escala = 1, tono = "#f2c14e" }: { x: number; y: number; escala?: number; tono?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <path d="M0 6a4 4 0 0 1 4-4h13l5 5h22a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z" fill={tono} />
      <path d="M0 14a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z" fill="#f7d27a" />
    </g>
  );
}

/** Ventana de Chrome: pestaña, barra de direcciones y los íconos de la derecha. El contenido va debajo (y ≥ 88). */
function Ventana({
  pestana,
  direccion,
  children,
  descargas,
  barra,
  puzzle,
  menu,
  cursorEnBarra,
}: {
  pestana: string;
  direccion: React.ReactNode;
  children?: React.ReactNode;
  descargas?: boolean;
  barra?: boolean;
  puzzle?: boolean;
  menu?: boolean;
  cursorEnBarra?: boolean;
}) {
  return (
    <g>
      <rect x={13} y={15} width={496} height={314} rx={14} fill="#0b1b24" opacity={0.07} />
      <rect x={10} y={10} width={496} height={314} rx={14} fill="#fff" stroke={LINEA} />
      <path d="M10 24a14 14 0 0 1 14-14h468a14 14 0 0 1 14 14v22H10z" fill="#e7ebee" />
      <path d="M22 46V27a9 9 0 0 1 9-9h170a9 9 0 0 1 9 9v19z" fill="#fff" />
      <circle cx={40} cy={32} r={6} fill={VERDE} opacity={0.9} />
      <text x={53} y={36.5} fontSize={12.5} fill={TEXTO}>
        {pestana}
      </text>
      <path d="M194 28l8 8M202 28l-8 8" stroke={SUAVE} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M226 32h11M231.5 26.5v11" stroke={SUAVE} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M458 30h10M476 26h9v9h-9zM494 27l8 8M502 27l-8 8" fill="none" stroke={SUAVE} strokeWidth={1.3} />
      {/* Barra de herramientas */}
      <path d="M28 66h13M28 66l5-5M28 66l5 5" fill="none" stroke={SUAVE} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M66 66H53M66 66l-5-5M66 66l-5 5" fill="none" stroke="#b7c0c8" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M90 61.5a6.5 6.5 0 1 0 1.6 5.5M90 58v4h-4" fill="none" stroke={SUAVE} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={106} y={52} width={300} height={28} rx={14} fill={GRIS} />
      <text x={124} y={70.5} fontSize={13.5} fill={TEXTO}>
        {direccion}
      </text>
      {barra && <Halo x={106} y={52} w={300} h={28} r={14} />}
      {cursorEnBarra && <Cursor x={300} y={68} />}
      {descargas && (
        <path d="M428 58v12M423 65l5 5 5-5M421 74h14" fill="none" stroke={descargas ? VERDE_OSCURO : SUAVE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      )}
      <Rompecabezas x={448} y={56} color={puzzle ? VERDE_OSCURO : SUAVE} />
      {puzzle && <Halo x={446} y={54} w={22} h={22} r={11} />}
      <circle cx={487} cy={59} r={1.8} fill={SUAVE} />
      <circle cx={487} cy={66} r={1.8} fill={SUAVE} />
      <circle cx={487} cy={73} r={1.8} fill={SUAVE} />
      {menu && <Halo x={478} y={54} w={18} h={24} r={9} />}
      <line x1={10} x2={506} y1={88} y2={88} stroke="#e3e7eb" />
      <rect x={11} y={89} width={494} height={234} rx={0} fill="#fafbfc" />
      <path d="M11 300v9a14 14 0 0 0 14 14h466a14 14 0 0 0 14-14v-9z" fill="#fafbfc" />
      {children}
    </g>
  );
}

/** Página del panel de fondo, borrosa a propósito: líneas en vez de texto. */
function PanelDeFondo() {
  return (
    <g opacity={0.9}>
      <rect x={34} y={108} width={150} height={12} rx={6} fill="#dfe5ea" />
      <rect x={34} y={130} width={210} height={8} rx={4} fill="#e8edf1" />
      <rect x={34} y={146} width={180} height={8} rx={4} fill="#e8edf1" />
      <rect x={34} y={176} width={186} height={40} rx={10} fill={VERDE_OSCURO} />
      <text x={127} y={201} fontSize={13} fill="#fff" textAnchor="middle" fontWeight={600}>
        Descargar la extensión
      </text>
      <rect x={34} y={236} width={200} height={8} rx={4} fill="#e8edf1" />
      <rect x={34} y={252} width={160} height={8} rx={4} fill="#e8edf1" />
    </g>
  );
}

export function IlusDescargar() {
  return (
    <Lienzo titulo="Chrome con la descarga terminada: el archivo buscador-duenos.zip aparece arriba a la derecha, en Descargas recientes.">
      <Ventana pestana="Panel de tu asistente" direccion="tu panel · Dueños directos" descargas>
        <PanelDeFondo />
        <Halo x={420} y={55} w={16} h={22} r={6} />
        {/* Globo de descargas */}
        <path d="M424 94l6-7 6 7" fill="#fff" stroke={LINEA} />
        <rect x={262} y={94} width={234} height={118} rx={12} fill="#fff" stroke={LINEA} />
        <path d="M425 95h10" stroke="#fff" strokeWidth={2} />
        <text x={280} y={120} fontSize={13} fontWeight={600} fill={TEXTO}>
          Descargas recientes
        </text>
        <rect x={274} y={134} width={210} height={58} rx={10} fill="#eef8f5" />
        <Halo x={274} y={134} w={210} h={58} r={10} />
        <Archivo x={286} y={142} escala={0.82} />
        <text x={326} y={160} fontSize={13.5} fontWeight={600} fill={TEXTO}>
          buscador-duenos.zip
        </text>
        <text x={326} y={179} fontSize={12} fill={SUAVE}>
          Listo · en Descargas
        </text>
        <Cursor x={196} y={204} />
      </Ventana>
    </Lienzo>
  );
}

function VentanaArchivos({ mac, children }: { mac: boolean; children: React.ReactNode }) {
  return (
    <g>
      <rect x={13} y={15} width={496} height={314} rx={12} fill="#0b1b24" opacity={0.07} />
      <rect x={10} y={10} width={496} height={314} rx={12} fill="#fff" stroke={LINEA} />
      <path d="M10 22a12 12 0 0 1 12-12h472a12 12 0 0 1 12 12v24H10z" fill={mac ? "#eceef0" : "#f3f5f7"} />
      {mac ? (
        <>
          <circle cx={30} cy={28} r={5.5} fill="#ff5f57" />
          <circle cx={48} cy={28} r={5.5} fill="#febc2e" />
          <circle cx={66} cy={28} r={5.5} fill="#28c840" />
          <text x={258} y={33} fontSize={13} fontWeight={600} fill={TEXTO} textAnchor="middle">
            Descargas
          </text>
        </>
      ) : (
        <>
          <Carpeta x={22} y={19} escala={0.36} />
          <text x={46} y={33} fontSize={12.5} fill={TEXTO}>
            Descargas
          </text>
          <path d="M452 28h10M470 23h9v9h-9zM488 23l9 9M497 23l-9 9" fill="none" stroke={SUAVE} strokeWidth={1.3} />
        </>
      )}
      <line x1={10} x2={506} y1={46} y2={46} stroke="#e3e7eb" />
      <rect x={10} y={46} width={120} height={266} fill={mac ? "#f4f5f7" : "#fafbfc"} />
      <path d="M10 300v12a12 12 0 0 0 12 12h108v-24z" fill={mac ? "#f4f5f7" : "#fafbfc"} />
      {["Escritorio", "Descargas", "Documentos", "Imágenes"].map((n, i) => (
        <g key={n}>
          {n === "Descargas" && <rect x={18} y={64 + i * 30} width={104} height={24} rx={6} fill={mac ? "#dfe3e8" : "#e3f1ec"} />}
          <text x={30} y={81 + i * 30} fontSize={12.5} fill={n === "Descargas" ? TEXTO : SUAVE} fontWeight={n === "Descargas" ? 600 : 400}>
            {n}
          </text>
        </g>
      ))}
      <line x1={130} x2={130} y1={46} y2={324} stroke="#e3e7eb" />
      {children}
    </g>
  );
}

export function IlusDescomprimirWindows() {
  return (
    <Lienzo titulo="Carpeta Descargas de Windows: clic derecho sobre buscador-duenos.zip y, en el menú, Extraer todo.">
      <VentanaArchivos mac={false}>
        <rect x={150} y={66} width={96} height={98} rx={8} fill="#e3f1ec" />
        <Archivo x={180} y={76} />
        <text x={198} y={148} fontSize={11.5} fill={TEXTO} textAnchor="middle">
          buscador-
        </text>
        <text x={198} y={160} fontSize={11.5} fill={TEXTO} textAnchor="middle">
          duenos.zip
        </text>
        {/* Menú del clic derecho */}
        <rect x={236} y={104} width={184} height={150} rx={10} fill="#fff" stroke={LINEA} />
        {["Abrir", "Extraer todo…", "Compartir", "Copiar"].map((n, i) => (
          <text key={n} x={256} y={134 + i * 32} fontSize={13.5} fill={TEXTO} fontWeight={i === 1 ? 600 : 400}>
            {n}
          </text>
        ))}
        <Halo x={244} y={148} w={168} h={28} r={6} />
        <Cursor x={360} y={160} />
        {/* Lo que queda */}
        <text x={262} y={290} fontSize={12.5} fill={SUAVE} textAnchor="end">
          Queda una carpeta
        </text>
        <path d="M272 286h44" stroke={VERDE_OSCURO} strokeWidth={2} strokeLinecap="round" />
        <path d="M310 280l6 6-6 6" fill="none" stroke={VERDE_OSCURO} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Halo x={326} y={266} w={168} h={38} r={8} />
        <Carpeta x={334} y={269} escala={0.72} />
        <text x={376} y={290} fontSize={13} fill={TEXTO} fontWeight={600}>
          buscador-duenos
        </text>
      </VentanaArchivos>
    </Lienzo>
  );
}

export function IlusDescomprimirMac() {
  return (
    <Lienzo titulo="Carpeta Descargas de Mac: doble clic en buscador-duenos.zip y al lado aparece la carpeta buscador-duenos.">
      <VentanaArchivos mac>
        <Archivo x={190} y={98} escala={1.3} />
        <text x={213} y={190} fontSize={12.5} fill={TEXTO} textAnchor="middle">
          buscador-duenos.zip
        </text>
        <Cursor x={214} y={140} />
        <rect x={236} y={118} width={70} height={22} rx={11} fill={TEXTO} />
        <text x={271} y={133.5} fontSize={11.5} fill="#fff" textAnchor="middle" fontWeight={600}>
          doble clic
        </text>
        <path d="M290 160h60" stroke={VERDE_OSCURO} strokeWidth={2} strokeLinecap="round" />
        <path d="M344 154l6 6-6 6" fill="none" stroke={VERDE_OSCURO} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Halo x={360} y={106} w={116} h={98} r={10} />
        <Carpeta x={388} y={114} escala={1.25} />
        <text x={418} y={190} fontSize={12.5} fill={TEXTO} textAnchor="middle" fontWeight={600}>
          buscador-duenos
        </text>
        <text x={318} y={262} fontSize={13} fill={SUAVE} textAnchor="middle">
          La carpeta aparece al lado del archivo.
        </text>
      </VentanaArchivos>
    </Lienzo>
  );
}

export function IlusAbrirBarra({ direccion }: { direccion: string }) {
  return (
    <Lienzo titulo={`Pestaña nueva de Chrome con ${direccion} escrito en la barra de direcciones, listo para presionar Enter.`}>
      <Ventana pestana="Pestaña nueva" direccion={<tspan fontWeight={600}>{direccion}</tspan>} barra cursorEnBarra>
        <rect x={110} y={58} width={1.6} height={16} fill={TEXTO} transform={`translate(${direccion.length * 7.6 + 16} 0)`} />
        {/* Tecla Enter */}
        <g transform="translate(330 168)">
          <rect x={0} y={6} width={130} height={70} rx={14} fill="#c9d1d8" />
          <rect x={0} y={0} width={130} height={70} rx={14} fill="#fff" stroke={LINEA} />
          <text x={22} y={42} fontSize={18} fontWeight={600} fill={TEXTO}>
            Enter
          </text>
          <path d="M106 24v14H82M88 32l-6 6 6 6" fill="none" stroke={TEXTO} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g transform="translate(56 152)">
          <text x={0} y={18} fontSize={14} fill={TEXTO} fontWeight={600}>
            1. Pega la dirección
          </text>
          <text x={0} y={42} fontSize={13} fill={SUAVE}>
            Clic en la barra de arriba
          </text>
          <text x={0} y={62} fontSize={13} fill={SUAVE}>
            y Ctrl+V (en Mac, ⌘+V)
          </text>
          <text x={0} y={102} fontSize={14} fill={TEXTO} fontWeight={600}>
            2. Presiona Enter
          </text>
        </g>
      </Ventana>
    </Lienzo>
  );
}

export function IlusAbrirMenu({ extensiones, gestionar }: { extensiones: string; gestionar: string }) {
  return (
    <Lienzo titulo={`Menú de los tres puntos de Chrome: ${extensiones} y luego ${gestionar}.`} alto={250}>
      <g transform="translate(0 -6)">
        <rect x={250} y={16} width={256} height={36} rx={10} fill="#fff" stroke={LINEA} />
        <text x={266} y={39} fontSize={12.5} fill={SUAVE}>
          Arriba a la derecha de Chrome
        </text>
        <circle cx={487} cy={27} r={1.8} fill={SUAVE} />
        <circle cx={487} cy={34} r={1.8} fill={SUAVE} />
        <circle cx={487} cy={41} r={1.8} fill={SUAVE} />
        <Halo x={478} y={22} w={18} h={24} r={9} />
        <rect x={268} y={62} width={238} height={176} rx={12} fill="#fff" stroke={LINEA} />
        {["Pestaña nueva", "Historial", "Descargas", extensiones, "Configuración"].map((n, i) => (
          <text key={n} x={286} y={92 + i * 32} fontSize={13.5} fill={TEXTO} fontWeight={i === 3 ? 600 : 400}>
            {n}
          </text>
        ))}
        <path d="M484 182l5 5-5 5" fill="none" stroke={SUAVE} strokeWidth={1.6} strokeLinecap="round" />
        <Halo x={276} y={172} w={222} h={26} r={6} />
        <rect x={20} y={164} width={236} height={46} rx={12} fill="#fff" stroke={LINEA} />
        <text x={38} y={192} fontSize={13.5} fill={TEXTO} fontWeight={600}>
          {gestionar}
        </text>
        <Halo x={26} y={170} w={224} h={34} r={8} />
        <Cursor x={190} y={190} />
      </g>
    </Lienzo>
  );
}

/** Página de extensiones: título, buscador y "Modo de desarrollador" arriba a la derecha. */
function PaginaExtensiones({ encendido, children }: { encendido: boolean; children?: React.ReactNode }) {
  return (
    <>
      <rect x={11} y={89} width={494} height={46} fill="#fff" />
      <line x1={11} x2={505} y1={135} y2={135} stroke="#e3e7eb" />
      <path d="M26 105h14M26 112h14M26 119h14" stroke={SUAVE} strokeWidth={1.6} strokeLinecap="round" />
      <text x={52} y={117} fontSize={15} fill={TEXTO} fontWeight={600}>
        Extensiones
      </text>
      <rect x={160} y={100} width={120} height={24} rx={12} fill={GRIS} />
      <text x={176} y={116} fontSize={11.5} fill={SUAVE}>
        Buscar extensiones
      </text>
      <text x={300} y={117} fontSize={12.5} fill={TEXTO}>
        Modo de desarrollador
      </text>
      <rect x={446} y={104} width={34} height={18} rx={9} fill={encendido ? AZUL : "#c3cad1"} />
      <circle cx={encendido ? 471 : 455} cy={113} r={7} fill="#fff" />
      {encendido && (
        <>
          <rect x={11} y={136} width={494} height={40} fill="#fff" />
          <line x1={11} x2={505} y1={176} y2={176} stroke="#e3e7eb" />
          <rect x={26} y={144} width={140} height={26} rx={13} fill="#fff" stroke="#9aa6b1" />
          <text x={96} y={161.5} fontSize={12} fill={AZUL} textAnchor="middle" fontWeight={600}>
            Cargar descomprimida
          </text>
          <rect x={176} y={144} width={140} height={26} rx={13} fill="#fff" stroke="#c9d1d8" />
          <text x={246} y={161.5} fontSize={12} fill={SUAVE} textAnchor="middle">
            Empaquetar extensión
          </text>
          <rect x={326} y={144} width={84} height={26} rx={13} fill="#fff" stroke="#c9d1d8" />
          <text x={368} y={161.5} fontSize={12} fill={SUAVE} textAnchor="middle">
            Actualizar
          </text>
        </>
      )}
      {children}
    </>
  );
}

function TarjetaOtraExtension({ y }: { y: number }) {
  return (
    <g>
      <rect x={30} y={y} width={220} height={92} rx={10} fill="#fff" stroke="#e3e7eb" />
      <rect x={44} y={y + 16} width={28} height={28} rx={6} fill="#e8edf1" />
      <rect x={82} y={y + 18} width={110} height={9} rx={4.5} fill="#dfe5ea" />
      <rect x={82} y={y + 34} width={140} height={7} rx={3.5} fill="#eef1f4" />
      <rect x={44} y={y + 62} width={50} height={8} rx={4} fill="#eef1f4" />
      <rect x={212} y={y + 62} width={24} height={12} rx={6} fill={AZUL} opacity={0.55} />
    </g>
  );
}

export function IlusModoDesarrollador({ direccion }: { direccion: string }) {
  return (
    <Lienzo titulo="Página de extensiones: arriba a la derecha, el interruptor Modo de desarrollador, encendido.">
      <Ventana pestana="Extensiones" direccion={direccion}>
        <PaginaExtensiones encendido>
          <Halo x={296} y={101} w={190} h={24} r={12} />
          <Cursor x={466} y={116} />
          <TarjetaOtraExtension y={196} />
          <g opacity={0.6}>
            <rect x={266} y={196} width={220} height={92} rx={10} fill="#fff" stroke="#e3e7eb" />
            <rect x={280} y={212} width={28} height={28} rx={6} fill="#e8edf1" />
            <rect x={318} y={214} width={100} height={9} rx={4.5} fill="#dfe5ea" />
          </g>
        </PaginaExtensiones>
      </Ventana>
    </Lienzo>
  );
}

export function IlusCargarDescomprimida({ direccion }: { direccion: string }) {
  return (
    <Lienzo titulo="Botón Cargar descomprimida, arriba a la izquierda, y la ventana para elegir la carpeta buscador-duenos.">
      <Ventana pestana="Extensiones" direccion={direccion}>
        <PaginaExtensiones encendido>
          <Halo x={26} y={144} w={140} h={26} r={13} />
          {/* Ventana para elegir la carpeta */}
          <rect x={186} y={188} width={302} height={124} rx={12} fill="#fff" stroke={LINEA} />
          <rect x={186} y={188} width={302} height={124} rx={12} fill="none" stroke="#0b1b24" strokeOpacity={0.05} strokeWidth={6} />
          <text x={204} y={212} fontSize={12.5} fill={TEXTO} fontWeight={600}>
            Seleccionar carpeta
          </text>
          <rect x={200} y={224} width={150} height={38} rx={8} fill="#e3f1ec" />
          <Carpeta x={208} y={230} escala={0.55} />
          <text x={244} y={248} fontSize={12.5} fill={TEXTO} fontWeight={600}>
            buscador-duenos
          </text>
          <rect x={364} y={224} width={110} height={38} rx={8} fill="#fafbfc" />
          <Carpeta x={372} y={230} escala={0.55} tono="#e6cf8f" />
          <text x={404} y={248} fontSize={12} fill={SUAVE}>
            Documentos
          </text>
          <rect x={390} y={274} width={86} height={28} rx={14} fill={AZUL} />
          <text x={433} y={292.5} fontSize={12} fill="#fff" textAnchor="middle" fontWeight={600}>
            Seleccionar
          </text>
          <Halo x={200} y={224} w={150} h={38} r={8} />
          <Cursor x={120} y={162} />
          <circle cx={56} cy={232} r={16} fill={VERDE_OSCURO} />
          <text x={56} y={237} fontSize={14} fill="#fff" textAnchor="middle" fontWeight={700}>
            1
          </text>
          <text x={80} y={237} fontSize={12.5} fill={TEXTO}>
            Tócalo
          </text>
          <circle cx={56} cy={280} r={16} fill={VERDE_OSCURO} />
          <text x={56} y={285} fontSize={14} fill="#fff" textAnchor="middle" fontWeight={700}>
            2
          </text>
          <text x={80} y={278} fontSize={12.5} fill={TEXTO}>
            Elige la
          </text>
          <text x={80} y={294} fontSize={12.5} fill={TEXTO}>
            carpeta
          </text>
        </PaginaExtensiones>
      </Ventana>
    </Lienzo>
  );
}

/** El panel y la extensión, enlazados. */
export function IlusConectar({ conectada, version }: { conectada: boolean; version: string }) {
  return (
    <Lienzo titulo={conectada ? "La extensión quedó conectada a tu panel." : "La extensión se conecta con tu panel."} alto={280}>
      <rect x={30} y={60} width={190} height={170} rx={16} fill="#fff" stroke={LINEA} />
      <rect x={30} y={60} width={190} height={40} rx={16} fill="#e7ebee" />
      <rect x={30} y={84} width={190} height={16} fill="#e7ebee" />
      <circle cx={52} cy={80} r={6} fill={VERDE} />
      <text x={66} y={85} fontSize={13} fill={TEXTO} fontWeight={600}>
        Tu panel
      </text>
      <rect x={50} y={118} width={120} height={10} rx={5} fill="#dfe5ea" />
      <rect x={50} y={138} width={150} height={8} rx={4} fill="#eef1f4" />
      <rect x={50} y={154} width={130} height={8} rx={4} fill="#eef1f4" />
      <rect x={50} y={180} width={110} height={30} rx={8} fill={VERDE_OSCURO} />
      <text x={105} y={199.5} fontSize={12} fill="#fff" textAnchor="middle" fontWeight={600}>
        Dueños directos
      </text>

      <rect x={300} y={60} width={190} height={170} rx={16} fill="#fff" stroke={LINEA} />
      <rect x={318} y={80} width={44} height={44} rx={10} fill="#e3f1ec" />
      <Rompecabezas x={329} y={90} color={VERDE_OSCURO} />
      <text x={318} y={150} fontSize={13.5} fill={TEXTO} fontWeight={600}>
        Buscador de dueños
      </text>
      <text x={318} y={170} fontSize={12} fill={SUAVE}>
        Versión {version}
      </text>
      <rect x={318} y={184} width={154} height={28} rx={14} fill={conectada ? "#e3f1ec" : GRIS} />
      <text x={395} y={202.5} fontSize={12} fill={conectada ? VERDE_OSCURO : SUAVE} textAnchor="middle" fontWeight={600}>
        {conectada ? "Conectada" : "Conectando…"}
      </text>

      <path className={conectada ? undefined : "ilus-enlace"} d="M224 145h72" stroke={conectada ? VERDE : "#9aa6b1"} strokeWidth={3} strokeDasharray={conectada ? undefined : "6 7"} strokeLinecap="round" />
      <circle cx={260} cy={145} r={20} fill={conectada ? VERDE_OSCURO : "#fff"} stroke={conectada ? VERDE_OSCURO : LINEA} strokeWidth={2} />
      {conectada ? (
        <path d="M251 145l6 6 11-12" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path
          transform="translate(248 133)"
          d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"
          fill="none"
          stroke={VERDE_OSCURO}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Lienzo>
  );
}

/** Fijar la extensión desde la pieza de rompecabezas. */
export function IlusFijar() {
  return (
    <Lienzo titulo="La pieza de rompecabezas, arriba a la derecha de Chrome, abre la lista de extensiones; el alfiler al lado de Buscador de dueños la fija." alto={250}>
      <rect x={180} y={16} width={326} height={40} rx={12} fill="#fff" stroke={LINEA} />
      <rect x={194} y={26} width={180} height={20} rx={10} fill={GRIS} />
      <Rompecabezas x={448} y={25} color={VERDE_OSCURO} />
      <Halo x={446} y={23} w={22} h={22} r={11} />
      <circle cx={487} cy={29} r={1.8} fill={SUAVE} />
      <circle cx={487} cy={36} r={1.8} fill={SUAVE} />
      <circle cx={487} cy={43} r={1.8} fill={SUAVE} />
      <rect x={236} y={66} width={270} height={150} rx={12} fill="#fff" stroke={LINEA} />
      <text x={254} y={94} fontSize={13.5} fill={TEXTO} fontWeight={600}>
        Extensiones
      </text>
      <rect x={248} y={110} width={246} height={40} rx={8} fill="#eef8f5" />
      <rect x={258} y={118} width={24} height={24} rx={6} fill="#e3f1ec" />
      <Rompecabezas x={261} y={121} color={VERDE_OSCURO} />
      <text x={292} y={135} fontSize={13} fill={TEXTO}>
        Buscador de dueños
      </text>
      <g transform="translate(456 120)">
        <path d="M6 0h8l-1 7 4 4H3l4-4z M10 11v9" fill="none" stroke={VERDE_OSCURO} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      </g>
      <Halo x={452} y={116} w={28} h={28} r={8} />
      <rect x={396} y={160} width={56} height={24} rx={6} fill={TEXTO} />
      <text x={424} y={176.5} fontSize={12} fill="#fff" textAnchor="middle" fontWeight={600}>
        Fijar
      </text>
      <Cursor x={468} y={134} />
      <rect x={248} y={192} width={150} height={8} rx={4} fill="#eef1f4" />
      <text x={30} y={110} fontSize={14} fill={TEXTO} fontWeight={600}>
        1. Toca la pieza
      </text>
      <text x={30} y={134} fontSize={14} fill={TEXTO} fontWeight={600}>
        2. Toca el alfiler
      </text>
      <text x={30} y={162} fontSize={12.5} fill={SUAVE}>
        Así queda siempre a la vista,
      </text>
      <text x={30} y={180} fontSize={12.5} fill={SUAVE}>
        junto a la barra de direcciones.
      </text>
    </Lienzo>
  );
}

/** Reemplazar la carpeta anterior por la nueva. */
export function IlusReemplazar() {
  return (
    <Lienzo titulo="La carpeta nueva buscador-duenos va en el mismo lugar que la anterior y la reemplaza." alto={250}>
      <rect x={20} y={30} width={480} height={190} rx={14} fill="#fff" stroke={LINEA} />
      <g opacity={0.45}>
        <Carpeta x={60} y={84} escala={1.4} tono="#c9b98a" />
        <text x={94} y={170} fontSize={12.5} fill={TEXTO} textAnchor="middle">
          buscador-duenos
        </text>
        <text x={94} y={188} fontSize={12} fill={SUAVE} textAnchor="middle">
          (la anterior)
        </text>
      </g>
      <path d="M150 112l210 0" stroke="#c3cad1" strokeWidth={2} strokeDasharray="6 6" />
      <path d="M180 96l-24 16 24 16" fill="none" stroke={VERDE_OSCURO} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={196} y={92} width={124} height={40} rx={10} fill={TEXTO} />
      <text x={258} y={117} fontSize={13} fill="#fff" textAnchor="middle" fontWeight={600}>
        Reemplazar
      </text>
      <Halo x={372} y={70} w={96} h={126} r={12} />
      <Carpeta x={386} y={84} escala={1.4} />
      <text x={420} y={170} fontSize={12.5} fill={TEXTO} textAnchor="middle" fontWeight={600}>
        buscador-duenos
      </text>
      <text x={420} y={188} fontSize={12} fill={VERDE_OSCURO} textAnchor="middle" fontWeight={600}>
        la nueva
      </text>
    </Lienzo>
  );
}

/** La tarjeta de la extensión en la página de extensiones, con la flecha circular para volver a cargarla. */
export function IlusRecargar({ direccion }: { direccion: string }) {
  return (
    <Lienzo titulo="En la página de extensiones, la tarjeta Buscador de dueños y su flecha circular para volver a cargarla.">
      <Ventana pestana="Extensiones" direccion={direccion}>
        <PaginaExtensiones encendido>
          <rect x={30} y={192} width={300} height={112} rx={12} fill="#fff" stroke="#d5dbe0" />
          <rect x={46} y={208} width={36} height={36} rx={8} fill="#e3f1ec" />
          <Rompecabezas x={53} y={215} color={VERDE_OSCURO} />
          <text x={94} y={222} fontSize={13.5} fill={TEXTO} fontWeight={600}>
            Buscador de dueños
          </text>
          <text x={94} y={240} fontSize={11.5} fill={SUAVE}>
            Busca dueños directos…
          </text>
          <text x={46} y={286} fontSize={12} fill={AZUL} fontWeight={600}>
            Detalles
          </text>
          <text x={110} y={286} fontSize={12} fill={AZUL} fontWeight={600}>
            Quitar
          </text>
          <path d="M260 276a8 8 0 1 0 2.5 6.5M262.5 270.5v6h-6" fill="none" stroke={TEXTO} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Halo x={248} y={268} w={22} h={22} r={11} />
          <rect x={284} y={274} width={30} height={16} rx={8} fill={AZUL} />
          <circle cx={306} cy={282} r={6} fill="#fff" />
          <Cursor x={262} y={282} />
          <g opacity={0.55}>
            <rect x={346} y={192} width={140} height={112} rx={12} fill="#fff" stroke="#e3e7eb" />
            <rect x={360} y={208} width={28} height={28} rx={6} fill="#e8edf1" />
            <rect x={360} y={248} width={100} height={8} rx={4} fill="#dfe5ea" />
            <rect x={360} y={264} width={80} height={7} rx={3.5} fill="#eef1f4" />
          </g>
        </PaginaExtensiones>
      </Ventana>
    </Lienzo>
  );
}

/** Computadora ← teléfono: el enlace viaja del teléfono a la computadora. */
export function IlusComputadora() {
  return (
    <Lienzo titulo="El enlace pasa del teléfono a la computadora, donde se instala la extensión." alto={250}>
      <rect x={150} y={28} width={330} height={190} rx={14} fill="#fff" stroke={LINEA} strokeWidth={2} />
      <rect x={164} y={42} width={302} height={150} rx={6} fill="#fafbfc" />
      <rect x={164} y={42} width={302} height={26} rx={6} fill="#e7ebee" />
      <rect x={210} y={49} width={200} height={12} rx={6} fill="#fff" />
      <Rompecabezas x={430} y={45} color={VERDE_OSCURO} />
      <rect x={184} y={84} width={130} height={10} rx={5} fill="#dfe5ea" />
      <rect x={184} y={104} width={200} height={8} rx={4} fill="#eef1f4" />
      <rect x={184} y={136} width={150} height={32} rx={9} fill={VERDE_OSCURO} />
      <text x={259} y={156.5} fontSize={12} fill="#fff" textAnchor="middle" fontWeight={600}>
        Descargar la extensión
      </text>
      <path d="M290 218l-14 20h78l-14-20z" fill="#e7ebee" />
      <rect x={256} y={236} width={118} height={8} rx={4} fill="#d5dbe0" />
      <rect x={30} y={88} width={78} height={146} rx={14} fill="#fff" stroke={TEXTO} strokeWidth={2.4} />
      <rect x={56} y={96} width={26} height={5} rx={2.5} fill={TEXTO} />
      <rect x={40} y={112} width={58} height={34} rx={8} fill="#e3f1ec" />
      <path d="M50 129h38M80 122l8 7-8 7" fill="none" stroke={VERDE_OSCURO} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={40} y={156} width={58} height={7} rx={3.5} fill="#eef1f4" />
      <rect x={40} y={170} width={44} height={7} rx={3.5} fill="#eef1f4" />
      <path className="ilus-enlace" d="M114 140C130 120 136 112 150 108" fill="none" stroke={VERDE} strokeWidth={2.5} strokeDasharray="5 6" strokeLinecap="round" />
      <path d="M140 102l10 6-8 8" fill="none" stroke={VERDE} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Lienzo>
  );
}
