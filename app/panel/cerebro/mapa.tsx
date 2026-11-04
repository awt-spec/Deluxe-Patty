// Mapa del cerebro de la asistente: un grafo radial dibujado en SVG (sin librerías). En el centro la
// asistente; alrededor, cada fuente de la que aprende con sus elementos. Las dudas van en ámbar: es lo
// que todavía no sabe. Cada nodo lleva a donde se edita.

export interface Rama {
  clave: string;
  nombre: string;
  href: string;
  tono: "verde" | "azul" | "morado" | "gris" | "ambar";
  hojas: { texto: string; href: string }[];
}

const ANCHO = 1000;
const ALTO = 740;
const C = { x: ANCHO / 2, y: ALTO / 2 };
const R_RAMA = 165;
const R_HOJA = 300;
const MAX_HOJAS = 6;

const corto = (t: string, n = 22) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const punto = (angulo: number, r: number) => ({ x: C.x + r * Math.cos(angulo), y: C.y + r * Math.sin(angulo) });

export function MapaCerebro({ ramas }: { ramas: Rama[] }) {
  const paso = (2 * Math.PI) / ramas.length;
  return (
    <figure className="mapa-cerebro">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Mapa de lo que sabe la asistente y de dónde lo aprende">
        {ramas.map((rama, i) => {
          const a = -Math.PI / 2 + i * paso;
          const p = punto(a, R_RAMA);
          const hojas = rama.hojas.slice(0, MAX_HOJAS);
          const extra = rama.hojas.length - hojas.length;
          const abanico = Math.min(paso * 0.85, 0.22 * Math.max(hojas.length + (extra > 0 ? 1 : 0) - 1, 0));
          const nodosHoja = [...hojas.map((h) => ({ ...h })), ...(extra > 0 ? [{ texto: `y ${extra} más`, href: rama.href }] : [])];
          return (
            <g key={rama.clave} className={`rama tono-${rama.tono}`}>
              <line x1={C.x} y1={C.y} x2={p.x} y2={p.y} className="arista fuerte" />
              {nodosHoja.map((h, j) => {
                const ah = nodosHoja.length === 1 ? a : a - abanico / 2 + (abanico * j) / (nodosHoja.length - 1);
                const q = punto(ah, R_HOJA);
                const derecha = Math.cos(ah) >= 0;
                return (
                  <a key={`${rama.clave}-${j}`} href={h.href}>
                    <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="arista" />
                    <circle cx={q.x} cy={q.y} r={7} className="hoja" />
                    <text x={q.x + (derecha ? 12 : -12)} y={q.y + 5} textAnchor={derecha ? "start" : "end"} className="hoja-texto">
                      {corto(h.texto)}
                    </text>
                  </a>
                );
              })}
              <a href={rama.href}>
                <circle cx={p.x} cy={p.y} r={38} className="nodo-rama" />
                <text x={p.x} y={p.y - 2} textAnchor="middle" className="rama-numero">
                  {rama.hojas.length}
                </text>
                <text x={p.x} y={p.y + 16} textAnchor="middle" className="rama-nombre">
                  {rama.nombre}
                </text>
              </a>
            </g>
          );
        })}
        <circle cx={C.x} cy={C.y} r={52} className="nodo-centro" />
        <text x={C.x} y={C.y + 6} textAnchor="middle" className="centro-texto">
          Asistente
        </text>
      </svg>
      <figcaption className="suave">Toca un círculo para ver o cambiar lo que hay ahí. En ámbar, lo que todavía no sabe.</figcaption>
    </figure>
  );
}
