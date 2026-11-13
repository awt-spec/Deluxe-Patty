// Dibujos de los asistentes paso a paso (puesta en marcha, contestar sola, calendario, anuncio y video): maquetas
// simplificadas de lo que la corredora va a ver, sin capturas ni logos de terceros, con lo que se toca en un halo
// verde. Todo en SVG: nítido en cualquier pantalla y liviano. El estilo sigue al de la extensión
// (app/panel/duenos/extension/ilustraciones.tsx).

import { useId } from "react";

const VERDE = "#00a884";
const VERDE_OSCURO = "#008069";
const VERDE_CLARO = "#e7f7f1";
const TEXTO = "#1f2328";
const SUAVE = "#5f6b76";
const LINEA = "#d5dbe0";
const GRIS = "#eef1f4";
const BURBUJA = "#d9fdd3";
const AMBAR = "#e3a008";

function Lienzo({ titulo, children, alto = 340 }: { titulo: string; children: React.ReactNode; alto?: number }) {
  const id = useId();
  return (
    <svg className="ilus" viewBox={`0 0 520 ${alto}`} role="img" aria-labelledby={`${id}-t`} focusable="false">
      <title id={`${id}-t`}>{titulo}</title>
      {children}
    </svg>
  );
}

function Halo({ x, y, w, h, r = 8 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <g>
      <rect className="ilus-halo" x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx={r + 6} fill={VERDE} opacity={0.16} />
      <rect x={x - 2.5} y={y - 2.5} width={w + 5} height={h + 5} rx={r + 2.5} fill="none" stroke={VERDE} strokeWidth={2.5} />
    </g>
  );
}

/** Un dedo que toca (círculo con onda), para el teléfono. */
function Toque({ x, y }: { x: number; y: number }) {
  return (
    <g aria-hidden>
      <circle cx={x} cy={y} r={16} fill={VERDE} opacity={0.18} className="ilus-halo" />
      <circle cx={x} cy={y} r={8} fill="#fff" stroke={VERDE_OSCURO} strokeWidth={2.5} />
    </g>
  );
}

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

/** Marco de teléfono: pantalla blanca con su barra de arriba. El contenido va en coordenadas del lienzo. */
function Telefono({ x, y, w = 210, h = 320, children }: { x: number; y: number; w?: number; h?: number; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={28} fill="#fff" stroke={TEXTO} strokeWidth={3} />
      <rect x={x + w / 2 - 28} y={y + 10} width={56} height={10} rx={5} fill={TEXTO} />
      {children}
    </g>
  );
}

/** Marco de navegador de computadora con la dirección. */
function Navegador({ x, y, w, h, direccion, children }: { x: number; y: number; w: number; h: number; direccion: string; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
      <path d={`M${x} ${y + 12}a12 12 0 0 1 12-12h${w - 24}a12 12 0 0 1 12 12v24H${x}z`} fill={GRIS} />
      <circle cx={x + 18} cy={y + 18} r={4.5} fill="#f28b82" />
      <circle cx={x + 32} cy={y + 18} r={4.5} fill="#fdd663" />
      <circle cx={x + 46} cy={y + 18} r={4.5} fill="#81c995" />
      <rect x={x + 62} y={y + 8} width={w - 80} height={20} rx={10} fill="#fff" />
      <text x={x + 74} y={y + 22} fontSize={12} fill={SUAVE}>
        {direccion}
      </text>
      {children}
    </g>
  );
}

function Burbuja({ x, y, w, texto, mia = false, alto = 34 }: { x: number; y: number; w: number; texto: string[]; mia?: boolean; alto?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={alto} rx={10} fill={mia ? BURBUJA : "#fff"} stroke={mia ? "none" : LINEA} />
      {texto.map((t, i) => (
        <text key={t} x={x + 10} y={y + 20 + i * 15} fontSize={12} fill={TEXTO}>
          {t}
        </text>
      ))}
    </g>
  );
}

function Boton({ x, y, w, h = 30, texto, lleno = true, tam = 13 }: { x: number; y: number; w: number; h?: number; texto: string; lleno?: boolean; tam?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={lleno ? VERDE_OSCURO : "#fff"} stroke={VERDE_OSCURO} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2 + tam / 3} fontSize={tam} fontWeight={700} fill={lleno ? "#fff" : VERDE_OSCURO} textAnchor="middle">
        {texto}
      </text>
    </g>
  );
}

function Linea({ x, y, w, color = LINEA, alto = 8 }: { x: number; y: number; w: number; color?: string; alto?: number }) {
  return <rect x={x} y={y} width={w} height={alto} rx={alto / 2} fill={color} />;
}

function CasaFoto({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#dcefe8" />
      <path d={`M${x + w * 0.2} ${y + h * 0.8}V${y + h * 0.48}L${x + w * 0.5} ${y + h * 0.24}L${x + w * 0.8} ${y + h * 0.48}V${y + h * 0.8}Z`} fill="#fff" stroke={VERDE_OSCURO} strokeWidth={1.8} strokeLinejoin="round" />
      <rect x={x + w * 0.44} y={y + h * 0.58} width={w * 0.12} height={h * 0.22} fill={VERDE_OSCURO} opacity={0.6} />
    </g>
  );
}

// --- Puesta en marcha -----------------------------------------------------------------------------------------

export function IlusCasas({ asistente }: { asistente: string }) {
  return (
    <Lienzo titulo={`Le cuentas la casa a ${asistente} y te muestra la ficha armada para que la confirmes.`}>
      <Telefono x={155} y={10}>
        <Burbuja x={190} y={46} w={160} mia texto={["Casa en Santa Ana, 3", "cuartos, con jardín…"]} alto={48} />
        <rect x={170} y={104} width={170} height={180} rx={14} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
        <CasaFoto x={180} y={114} w={150} h={70} />
        <text x={182} y={204} fontSize={13} fontWeight={700} fill={TEXTO}>
          Así quedó. ¿Está bien?
        </text>
        <Linea x={182} y={214} w={120} />
        <Linea x={182} y={228} w={90} />
        <Boton x={182} y={244} w={146} texto="Sí, guardarla" />
        <Halo x={182} y={244} w={146} h={30} r={15} />
      </Telefono>
    </Lienzo>
  );
}

export function IlusPrecioFotos() {
  return (
    <Lienzo titulo="La ficha de la casa con el precio puesto y las fotos subidas.">
      <rect x={60} y={20} width={400} height={300} rx={18} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
      <CasaFoto x={80} y={40} w={200} h={130} />
      <CasaFoto x={290} y={40} w={70} h={60} />
      <CasaFoto x={370} y={40} w={70} h={60} />
      <CasaFoto x={290} y={110} w={70} h={60} />
      <rect x={370} y={110} width={70} height={60} rx={8} fill={GRIS} stroke={VERDE_OSCURO} strokeDasharray="5 4" />
      <path d="M394 140h22M405 129v22" stroke={VERDE_OSCURO} strokeWidth={2.5} strokeLinecap="round" />
      <Halo x={370} y={110} w={70} h={60} r={8} />
      <text x={80} y={200} fontSize={16} fontWeight={700} fill={TEXTO}>
        Casa en Santa Ana
      </text>
      <text x={80} y={222} fontSize={12} fill={SUAVE}>
        Precio
      </text>
      <rect x={80} y={230} width={170} height={38} rx={10} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
      <text x={94} y={255} fontSize={16} fontWeight={700} fill={TEXTO}>
        $ 250 000
      </text>
      <Halo x={80} y={230} w={170} h={38} r={10} />
      <Linea x={290} y={238} w={140} />
      <Linea x={290} y={254} w={100} />
    </Lienzo>
  );
}

export function IlusHorario() {
  const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const man = [true, true, false, true, true, true];
  const tar = [true, false, true, true, false, false];
  return (
    <Lienzo titulo="Tu horario: para cada día tocas Mañana o Tarde según cuándo enseñas casas.">
      <rect x={40} y={20} width={440} height={300} rx={18} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
      <text x={64} y={56} fontSize={16} fontWeight={700} fill={TEXTO}>
        ¿Cuándo enseñas casas?
      </text>
      {dias.map((d, i) => {
        const y = 74 + i * 40;
        return (
          <g key={d}>
            <text x={64} y={y + 22} fontSize={14} fontWeight={600} fill={TEXTO}>
              {d}
            </text>
            <rect x={150} y={y} width={140} height={32} rx={16} fill={man[i] ? VERDE_CLARO : "#fff"} stroke={man[i] ? VERDE_OSCURO : LINEA} strokeWidth={1.5} />
            <text x={220} y={y + 21} fontSize={13} textAnchor="middle" fill={man[i] ? VERDE_OSCURO : SUAVE} fontWeight={600}>
              Mañana 8–12
            </text>
            <rect x={300} y={y} width={140} height={32} rx={16} fill={tar[i] ? VERDE_CLARO : "#fff"} stroke={tar[i] ? VERDE_OSCURO : LINEA} strokeWidth={1.5} />
            <text x={370} y={y + 21} fontSize={13} textAnchor="middle" fill={tar[i] ? VERDE_OSCURO : SUAVE} fontWeight={600}>
              Tarde 1–5
            </text>
          </g>
        );
      })}
      <Halo x={300} y={74 + 2 * 40} w={140} h={32} r={16} />
    </Lienzo>
  );
}

export function IlusTono({ asistente }: { asistente: string }) {
  return (
    <Lienzo titulo={`Un cliente pregunta y ${asistente} contesta con tu manera de escribir.`}>
      <Telefono x={155} y={10}>
        <rect x={158} y={30} width={204} height={290} fill="#efeae2" />
        <Burbuja x={170} y={54} w={150} texto={["Hola, ¿sigue", "disponible la casa?"]} alto={46} />
        <Burbuja x={196} y={112} w={156} mia texto={["Buenas tardes, sí", "está disponible.", "¿Le gustaría verla?"]} alto={62} />
        <Halo x={196} y={112} w={156} h={62} r={10} />
        <Burbuja x={170} y={194} w={110} texto={["¡Sí, gracias!"]} />
        <text x={260} y={300} fontSize={11} fill={SUAVE} textAnchor="middle">
          {asistente} escribe como tú
        </text>
      </Telefono>
    </Lienzo>
  );
}

export function IlusTemas({ asistente, corredor }: { asistente: string; corredor: string }) {
  return (
    <Lienzo titulo={`Cuando un cliente toca uno de tus temas, ${asistente} no contesta y te lo pasa a ti.`}>
      <Telefono x={20} y={10} w={200}>
        <rect x={23} y={30} width={194} height={290} fill="#efeae2" />
        <Burbuja x={34} y={60} w={160} texto={["¿Me rebaja el precio", "si pago de contado?"]} alto={46} />
        <Burbuja x={58} y={120} w={146} mia texto={["Se lo consulto a", `${corredor.split(" ")[0].slice(0, 12)} y le aviso.`]} alto={46} />
      </Telefono>
      <path d="M232 170 C 260 170, 268 170, 292 170" stroke={VERDE_OSCURO} strokeWidth={3} fill="none" strokeDasharray="7 6" />
      <path d="M286 162 L298 170 L286 178" stroke={VERDE_OSCURO} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Telefono x={300} y={10} w={200}>
        <rect x={316} y={60} width={168} height={110} rx={14} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
        <circle cx={340} cy={86} r={13} fill={VERDE_CLARO} />
        <path d="M334 90h12M336 90v-6a4 4 0 0 1 8 0v6M338 93h4" stroke={VERDE_OSCURO} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <text x={360} y={84} fontSize={12} fontWeight={700} fill={TEXTO}>
          Te lo paso a ti
        </text>
        <text x={360} y={99} fontSize={11} fill={SUAVE}>
          Pide rebaja
        </text>
        <Boton x={328} y={124} w={144} h={30} texto="Escribirle yo" tam={12} />
        <Halo x={316} y={60} w={168} h={110} r={14} />
      </Telefono>
    </Lienzo>
  );
}

export function IlusGoogle() {
  return (
    <Lienzo titulo="Tu correo y tu calendario conectados con el panel: las visitas y los correos de clientes pasan solos.">
      <rect x={30} y={100} width={150} height={140} rx={18} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
      <rect x={52} y={128} width={106} height={72} rx={8} fill={GRIS} />
      <path d="M52 132 L105 172 L158 132" fill="none" stroke={SUAVE} strokeWidth={2.5} strokeLinejoin="round" />
      <text x={105} y={224} fontSize={14} fontWeight={700} fill={TEXTO} textAnchor="middle">
        Correo
      </text>
      <rect x={340} y={100} width={150} height={140} rx={18} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
      <rect x={362} y={124} width={106} height={80} rx={8} fill="#fff" stroke={SUAVE} strokeWidth={2} />
      <rect x={362} y={124} width={106} height={20} rx={6} fill={SUAVE} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => <rect key={`${r}-${c}`} x={370 + c * 24} y={152 + r * 16} width={16} height={10} rx={2} fill={r === 1 && c === 2 ? VERDE : GRIS} />),
      )}
      <text x={415} y={224} fontSize={14} fontWeight={700} fill={TEXTO} textAnchor="middle">
        Calendario
      </text>
      <rect x={200} y={120} width={120} height={100} rx={20} fill={VERDE_CLARO} stroke={VERDE_OSCURO} strokeWidth={2} />
      <text x={260} y={166} fontSize={15} fontWeight={800} fill={VERDE_OSCURO} textAnchor="middle">
        Tu panel
      </text>
      <text x={260} y={186} fontSize={12} fill={VERDE_OSCURO} textAnchor="middle">
        y tu asistente
      </text>
      <path d="M182 170h16M322 170h16" stroke={VERDE_OSCURO} strokeWidth={3} strokeDasharray="5 4" />
      <Boton x={185} y={262} w={150} h={40} texto="Conectar" tam={15} />
      <Halo x={185} y={262} w={150} h={40} r={20} />
    </Lienzo>
  );
}

// --- Contestar sola -------------------------------------------------------------------------------------------

export function IlusEncender({ asistente }: { asistente: string }) {
  return (
    <Lienzo titulo={`El interruptor "${asistente} contesta sola" encendido.`} alto={260}>
      <rect x={40} y={40} width={440} height={180} rx={18} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
      <text x={70} y={96} fontSize={18} fontWeight={700} fill={TEXTO}>
        {asistente} contesta sola
      </text>
      <text x={70} y={122} fontSize={13} fill={SUAVE}>
        Sin esperar a que revises cada respuesta.
      </text>
      <rect x={370} y={78} width={74} height={40} rx={20} fill={VERDE_OSCURO} />
      <circle cx={424} cy={98} r={16} fill="#fff" />
      <Halo x={370} y={78} w={74} h={40} r={20} />
      <Linea x={70} y={160} w={260} color={GRIS} alto={10} />
      <Linea x={70} y={182} w={190} color={GRIS} alto={10} />
    </Lienzo>
  );
}

// --- Calendario en el teléfono --------------------------------------------------------------------------------

export function IlusSuscribirIphone() {
  return (
    <Lienzo titulo="El teléfono pregunta si quieres suscribirte al calendario: toca Suscribirse.">
      <Telefono x={155} y={10}>
        <rect x={158} y={30} width={204} height={290} fill="#f2f2f7" />
        <rect x={176} y={110} width={168} height={130} rx={16} fill="#fff" />
        <text x={260} y={140} fontSize={13} fontWeight={700} fill={TEXTO} textAnchor="middle">
          ¿Suscribirse a
        </text>
        <text x={260} y={157} fontSize={13} fontWeight={700} fill={TEXTO} textAnchor="middle">
          este calendario?
        </text>
        <line x1={176} y1={190} x2={344} y2={190} stroke={LINEA} />
        <line x1={260} y1={190} x2={260} y2={240} stroke={LINEA} />
        <text x={218} y={220} fontSize={13} fill={SUAVE} textAnchor="middle">
          Cancelar
        </text>
        <text x={302} y={220} fontSize={13} fontWeight={700} fill="#0a66d8" textAnchor="middle">
          Suscribirse
        </text>
        <Halo x={264} y={196} w={76} h={38} r={8} />
        <Toque x={310} y={226} />
      </Telefono>
    </Lienzo>
  );
}

export function IlusSuscribirAndroid() {
  return (
    <Lienzo titulo="Se abre tu calendario en el navegador y pregunta si quieres agregar el calendario: toca Agregar.">
      <Telefono x={155} y={10}>
        <rect x={168} y={34} width={184} height={22} rx={11} fill={GRIS} />
        <text x={180} y={49} fontSize={10} fill={SUAVE}>
          calendar…
        </text>
        <rect x={176} y={96} width={168} height={150} rx={14} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
        <text x={190} y={124} fontSize={13} fontWeight={700} fill={TEXTO}>
          ¿Agregar este
        </text>
        <text x={190} y={141} fontSize={13} fontWeight={700} fill={TEXTO}>
          calendario?
        </text>
        <Linea x={190} y={156} w={130} />
        <Linea x={190} y={170} w={100} />
        <text x={250} y={222} fontSize={13} fill={SUAVE} textAnchor="middle">
          Cancelar
        </text>
        <Boton x={278} y={204} w={56} h={28} texto="Agregar" tam={11} />
        <Halo x={278} y={204} w={56} h={28} r={14} />
        <Toque x={306} y={220} />
      </Telefono>
    </Lienzo>
  );
}

export function IlusCalendarioVisitas() {
  const horas = ["9", "10", "11", "12", "1", "2", "3"];
  return (
    <Lienzo titulo="Tu calendario del teléfono con las visitas del día.">
      <Telefono x={155} y={10}>
        <text x={176} y={50} fontSize={15} fontWeight={800} fill={TEXTO}>
          Hoy
        </text>
        {horas.map((h, i) => (
          <g key={h}>
            <text x={176} y={78 + i * 34} fontSize={10} fill={SUAVE}>
              {h}
            </text>
            <line x1={192} y1={74 + i * 34} x2={348} y2={74 + i * 34} stroke={GRIS} />
          </g>
        ))}
        <rect x={198} y={80} width={146} height={52} rx={8} fill={VERDE_CLARO} stroke={VERDE_OSCURO} strokeWidth={1.5} />
        <text x={206} y={99} fontSize={11} fontWeight={700} fill={VERDE_OSCURO}>
          Visita · Santa Ana
        </text>
        <text x={206} y={115} fontSize={10} fill={TEXTO}>
          Casa con jardín
        </text>
        <rect x={198} y={216} width={146} height={52} rx={8} fill={VERDE_CLARO} stroke={VERDE_OSCURO} strokeWidth={1.5} />
        <text x={206} y={235} fontSize={11} fontWeight={700} fill={VERDE_OSCURO}>
          Visita · Escazú
        </text>
        <text x={206} y={251} fontSize={10} fill={TEXTO}>
          Apartamento
        </text>
        <Halo x={198} y={80} w={146} h={52} r={8} />
      </Telefono>
    </Lienzo>
  );
}

// --- Anuncio de Encuentra24 -----------------------------------------------------------------------------------

export function IlusCopiarCampos() {
  return (
    <Lienzo titulo="En el panel, cada parte del anuncio tiene su botón Copiar.">
      <rect x={40} y={20} width={440} height={300} rx={18} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
      {[
        { y: 44, t: "Título", l: 1 },
        { y: 124, t: "Descripción", l: 3 },
        { y: 232, t: "Orden de fotos", l: 0 },
      ].map((c, i) => (
        <g key={c.t}>
          <text x={64} y={c.y + 14} fontSize={14} fontWeight={700} fill={TEXTO}>
            {c.t}
          </text>
          <Boton x={360} y={c.y} w={96} h={30} texto="Copiar" lleno={i !== 0} tam={13} />
          {c.l > 0 ? (
            Array.from({ length: c.l }).map((_, k) => <Linea key={k} x={64} y={c.y + 30 + k * 16} w={k === c.l - 1 ? 200 : 280} />)
          ) : (
            [0, 1, 2, 3].map((k) => (
              <g key={k}>
                <CasaFoto x={64 + k * 74} y={c.y + 28} w={64} h={48} />
                <circle cx={74 + k * 74} cy={c.y + 38} r={9} fill={VERDE_OSCURO} />
                <text x={74 + k * 74} y={c.y + 42} fontSize={10} fill="#fff" textAnchor="middle" fontWeight={700}>
                  {k + 1}
                </text>
              </g>
            ))
          )}
        </g>
      ))}
      <Halo x={360} y={44} w={96} h={30} r={15} />
      <Cursor x={420} y={64} />
    </Lienzo>
  );
}

export function IlusFormularioE24() {
  return (
    <Lienzo titulo="El formulario para publicar en Encuentra24: pegas el título, pegas la descripción con su enlace de WhatsApp y subes las fotos en orden.">
      <Navegador x={14} y={10} w={492} h={320} direccion="encuentra24.com · Publicar anuncio">
        <text x={36} y={70} fontSize={15} fontWeight={800} fill={TEXTO}>
          Publicar anuncio
        </text>
        <text x={36} y={96} fontSize={12} fontWeight={700} fill={SUAVE}>
          Título
        </text>
        <rect x={36} y={102} width={300} height={28} rx={6} fill="#fff" stroke={VERDE} strokeWidth={2} />
        <Linea x={46} y={113} w={200} color="#9aa6b1" alto={7} />
        <text x={36} y={152} fontSize={12} fontWeight={700} fill={SUAVE}>
          Descripción
        </text>
        <rect x={36} y={158} width={300} height={82} rx={6} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
        <Linea x={46} y={170} w={260} color="#9aa6b1" alto={7} />
        <Linea x={46} y={184} w={230} color="#9aa6b1" alto={7} />
        <Linea x={46} y={198} w={180} color="#9aa6b1" alto={7} />
        <rect x={44} y={210} width={200} height={22} rx={5} fill={VERDE_CLARO} />
        <text x={52} y={225} fontSize={11} fontWeight={700} fill={VERDE_OSCURO}>
          WhatsApp: wa.me/… ref.
        </text>
        <Halo x={44} y={210} w={200} h={22} r={5} />
        <text x={36} y={262} fontSize={12} fontWeight={700} fill={SUAVE}>
          Fotos
        </text>
        {[0, 1, 2, 3].map((k) => (
          <g key={k}>
            <CasaFoto x={36 + k * 62} y={268} w={54} h={46} />
            <circle cx={46 + k * 62} cy={278} r={8} fill={VERDE_OSCURO} />
            <text x={46 + k * 62} y={282} fontSize={10} fill="#fff" textAnchor="middle" fontWeight={700}>
              {k + 1}
            </text>
          </g>
        ))}
        {[
          { y: 116, n: "1", t: "Pega el título" },
          { y: 196, n: "2", t: "Pega la descripción" },
          { y: 290, n: "3", t: "Fotos en orden" },
        ].map((m) => (
          <g key={m.n}>
            <circle cx={370} cy={m.y} r={13} fill={VERDE_OSCURO} />
            <text x={370} y={m.y + 5} fontSize={13} fill="#fff" fontWeight={800} textAnchor="middle">
              {m.n}
            </text>
            <text x={390} y={m.y + 5} fontSize={12} fontWeight={600} fill={TEXTO}>
              {m.t}
            </text>
          </g>
        ))}
      </Navegador>
    </Lienzo>
  );
}

export function IlusLeerAnuncio() {
  return (
    <Lienzo titulo="Con tu anuncio ya publicado abierto en Chrome, tocas la extensión y luego Leer este anuncio.">
      <Navegador x={14} y={10} w={492} h={320} direccion="encuentra24.com · tu anuncio">
        <path
          transform="translate(468 16)"
          d="M2 6h4a2.5 2.5 0 1 1 5 0h4v4a2.5 2.5 0 1 1 0 5v4h-4a2.5 2.5 0 1 0-5 0H2v-4a2.5 2.5 0 1 0 0-5z"
          fill="none"
          stroke={VERDE_OSCURO}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <Halo x={464} y={12} w={26} h={26} r={6} />
        <CasaFoto x={34} y={58} w={200} h={130} />
        <Linea x={34} y={204} w={190} color="#9aa6b1" alto={10} />
        <Linea x={34} y={224} w={150} />
        <Linea x={34} y={240} w={170} />
        <Linea x={34} y={256} w={120} />
        <rect x={262} y={50} width={232} height={190} rx={14} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
        <text x={280} y={80} fontSize={14} fontWeight={800} fill={TEXTO}>
          Buscador de dueños
        </text>
        <text x={280} y={100} fontSize={11} fill={SUAVE}>
          Conectada a tu panel
        </text>
        <Boton x={280} y={120} w={196} h={38} texto="Leer este anuncio" tam={14} />
        <Halo x={280} y={120} w={196} h={38} r={19} />
        <Cursor x={400} y={142} />
        <Linea x={280} y={178} w={160} color={GRIS} />
        <Linea x={280} y={194} w={120} color={GRIS} />
      </Navegador>
    </Lienzo>
  );
}

// --- Subir el video -------------------------------------------------------------------------------------------

export function IlusGaleria({ android }: { android: boolean }) {
  return (
    <Lienzo titulo={android ? "La galería del teléfono con el video recién descargado arriba." : "La app Fotos del iPhone con el video recién descargado al final."}>
      <Telefono x={155} y={10}>
        <text x={176} y={52} fontSize={15} fontWeight={800} fill={TEXTO}>
          {android ? "Galería" : "Fotos"}
        </text>
        {Array.from({ length: 12 }).map((_, i) => {
          const c = i % 3;
          const f = Math.floor(i / 3);
          const x = 172 + c * 60;
          const y = 66 + f * 60;
          const video = android ? i === 0 : i === 11;
          return video ? (
            <g key={i}>
              <rect x={x} y={y} width={56} height={56} rx={6} fill={VERDE_OSCURO} />
              <path d={`M${x + 22} ${y + 18}v20l16-10z`} fill="#fff" />
              <text x={x + 52} y={y + 51} fontSize={9} fill="#fff" textAnchor="end">
                0:30
              </text>
            </g>
          ) : (
            <rect key={i} x={x} y={y} width={56} height={56} rx={6} fill={i % 2 ? "#dcefe8" : GRIS} />
          );
        })}
        {android ? <Halo x={172} y={66} w={56} h={56} r={6} /> : <Halo x={292} y={246} w={56} h={56} r={6} />}
      </Telefono>
    </Lienzo>
  );
}

export function IlusNuevaPublicacion({ app, boton }: { app: string; boton: string }) {
  return (
    <Lienzo titulo={`En ${app}, tocas ${boton} y eliges el video.`}>
      <Telefono x={155} y={10}>
        <text x={176} y={52} fontSize={14} fontWeight={800} fill={TEXTO}>
          {app}
        </text>
        <rect x={172} y={64} width={176} height={150} rx={10} fill={GRIS} />
        <Linea x={180} y={224} w={130} />
        <Linea x={180} y={240} w={100} />
        <rect x={158} y={276} width={204} height={44} fill="#fff" stroke={GRIS} />
        {[0, 1, 3, 4].map((k) => (
          <circle key={k} cx={180 + k * 40} cy={298} r={7} fill={LINEA} />
        ))}
        <rect x={246} y={284} width={28} height={28} rx={8} fill="#fff" stroke={TEXTO} strokeWidth={2} />
        <path d="M253 298h14M260 291v14" stroke={TEXTO} strokeWidth={2.5} strokeLinecap="round" />
        <Halo x={246} y={284} w={28} h={28} r={8} />
        <Toque x={266} y={304} />
        <text x={260} y={140} fontSize={12} fill={SUAVE} textAnchor="middle">
          Toca {boton}
        </text>
      </Telefono>
    </Lienzo>
  );
}

export function IlusPegarTexto({ musica }: { musica: boolean }) {
  return (
    <Lienzo titulo="Antes de publicar, pegas el texto en la descripción y, si quieres, agregas música.">
      <Telefono x={155} y={10}>
        <rect x={172} y={44} width={60} height={80} rx={8} fill={VERDE_OSCURO} />
        <path d="M194 72v22l18-11z" fill="#fff" />
        <rect x={240} y={44} width={108} height={80} rx={8} fill="#fff" stroke={VERDE} strokeWidth={2} />
        <Linea x={248} y={56} w={90} color="#9aa6b1" alto={7} />
        <Linea x={248} y={70} w={80} color="#9aa6b1" alto={7} />
        <Linea x={248} y={84} w={86} color="#9aa6b1" alto={7} />
        <Linea x={248} y={98} w={60} color="#9aa6b1" alto={7} />
        <rect x={260} y={128} width={58} height={24} rx={6} fill={TEXTO} />
        <text x={289} y={144} fontSize={11} fill="#fff" textAnchor="middle" fontWeight={700}>
          Pegar
        </text>
        <Halo x={240} y={44} w={108} h={80} r={8} />
        {musica && (
          <g>
            <rect x={172} y={176} width={176} height={40} rx={10} fill="#fff" stroke={LINEA} strokeWidth={1.5} />
            <path d="M190 206v-16l12-3v16" stroke={AMBAR} strokeWidth={2.5} fill="none" strokeLinecap="round" />
            <circle cx={187} cy={206} r={4} fill={AMBAR} />
            <circle cx={199} cy={203} r={4} fill={AMBAR} />
            <text x={214} y={201} fontSize={12} fontWeight={600} fill={TEXTO}>
              Agregar música
            </text>
          </g>
        )}
        <Boton x={176} y={262} w={168} h={36} texto="Compartir" tam={14} />
      </Telefono>
    </Lienzo>
  );
}
