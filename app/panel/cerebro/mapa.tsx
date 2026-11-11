"use client";
/* eslint-disable react-hooks/refs, react-hooks/immutability --
   Simulación de fuerzas a propósito imperativa: las posiciones viven en un ref que el cuadro de animación
   modifica 60 veces por segundo, y setCuadro fuerza el dibujo. Pasarlas a estado copiaría todo el grafo en
   cada cuadro. Deuda anotada en el diagnóstico de salud: si el mapa crece, moverlo a un useSyncExternalStore. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Mapa del cerebro de la asistente: grafo interactivo en SVG, sin librerías. En el centro la asistente;
// alrededor, cada fuente de la que aprende con sus elementos (las dudas en ámbar: lo que todavía no
// sabe). Se arrastran los nodos, se mueve y acerca el mapa (rueda, dos dedos o botones), se muestran u
// ocultan fuentes y cada fuente se abre o se recoge. Los nodos se acomodan solos con una simulación de
// fuerzas sencilla: resortes entre nodos unidos y repulsión entre todos.

export interface Rama {
  clave: string;
  nombre: string;
  href: string;
  tono: "verde" | "azul" | "morado" | "gris" | "ambar";
  hojas: { texto: string; href: string }[];
}

type Nodo = {
  id: string;
  tipo: "centro" | "rama" | "hoja";
  rama?: string;
  texto: string;
  href?: string;
  tono?: Rama["tono"];
  total?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fijo?: boolean;
};
type Arista = { de: string; a: string; largo: number };

const RECOGIDAS = 5;
const corto = (t: string, n = 26) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** Nodos y aristas visibles según las fuentes activas y las que están abiertas. */
function armar(ramas: Rama[], activas: Set<string>, abiertas: Set<string>, previos: Map<string, Nodo>) {
  const nodos: Nodo[] = [];
  const aristas: Arista[] = [];
  const conservar = (n: Nodo) => {
    const p = previos.get(n.id);
    nodos.push(p ? { ...n, x: p.x, y: p.y, vx: 0, vy: 0, fijo: p.fijo } : n);
  };
  conservar({ id: "centro", tipo: "centro", texto: "Asistente", x: 0, y: 0, vx: 0, vy: 0 });
  const visibles = ramas.filter((r) => activas.has(r.clave));
  visibles.forEach((r, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(visibles.length, 1);
    const id = `r:${r.clave}`;
    conservar({ id, tipo: "rama", rama: r.clave, texto: r.nombre, href: r.href, tono: r.tono, total: r.hojas.length, x: 170 * Math.cos(a), y: 170 * Math.sin(a), vx: 0, vy: 0 });
    aristas.push({ de: "centro", a: id, largo: 170 });
    const hojas = abiertas.has(r.clave) ? r.hojas : r.hojas.slice(0, RECOGIDAS);
    // Cuantos más elementos, más largos los brazos para que quepan sin encimarse.
    const brazo = 110 + Math.min(hojas.length, 14) * 9;
    hojas.forEach((h, j) => {
      const ah = a + (j - (hojas.length - 1) / 2) * 0.28;
      const hid = `h:${r.clave}:${j}`;
      conservar({ id: hid, tipo: "hoja", rama: r.clave, texto: h.texto, href: h.href, tono: r.tono, x: 300 * Math.cos(ah), y: 300 * Math.sin(ah), vx: 0, vy: 0 });
      aristas.push({ de: id, a: hid, largo: brazo });
    });
    if (!abiertas.has(r.clave) && r.hojas.length > RECOGIDAS) {
      const ah = a + ((hojas.length + 1) / 2) * 0.28;
      const hid = `m:${r.clave}`;
      conservar({ id: hid, tipo: "hoja", rama: r.clave, texto: `y ${r.hojas.length - RECOGIDAS} más`, tono: r.tono, x: 300 * Math.cos(ah), y: 300 * Math.sin(ah), vx: 0, vy: 0 });
      aristas.push({ de: id, a: hid, largo: brazo });
    }
  });
  return { nodos, aristas };
}

/** Un paso de la simulación: resortes en las aristas, repulsión entre nodos y freno. */
function paso(nodos: Nodo[], aristas: Arista[], arrastrado: string | null) {
  const porId = new Map(nodos.map((n) => [n.id, n]));
  for (let i = 0; i < nodos.length; i++) {
    for (let j = i + 1; j < nodos.length; j++) {
      const a = nodos[i];
      const b = nodos[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        d2 = 1;
      }
      // Las hojas se empujan más entre sí para que sus textos no se encimen.
      const k = a.tipo === "hoja" && b.tipo === "hoja" ? 5200 : 3200;
      const f = Math.min(k / d2, 9);
      const d = Math.sqrt(d2);
      a.vx -= (f * dx) / d;
      a.vy -= (f * dy) / d;
      b.vx += (f * dx) / d;
      b.vy += (f * dy) / d;
    }
  }
  for (const e of aristas) {
    const a = porId.get(e.de)!;
    const b = porId.get(e.a)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.max(Math.hypot(dx, dy), 0.01);
    const f = (d - e.largo) * 0.04;
    a.vx += (f * dx) / d;
    a.vy += (f * dy) / d;
    b.vx -= (f * dx) / d;
    b.vy -= (f * dy) / d;
  }
  let energia = 0;
  for (const n of nodos) {
    if (n.id === arrastrado || n.fijo) {
      n.vx = n.vy = 0;
      continue;
    }
    // El centro tiende a quedarse en el medio.
    if (n.tipo === "centro") {
      n.vx -= n.x * 0.05;
      n.vy -= n.y * 0.05;
    }
    n.vx *= 0.6;
    n.vy *= 0.6;
    n.x += n.vx;
    n.y += n.vy;
    energia += Math.abs(n.vx) + Math.abs(n.vy);
  }
  return energia;
}

const VISTA_INICIAL = { x: -480, y: -420, w: 960, h: 840 };

export function MapaCerebro({ ramas }: { ramas: Rama[] }) {
  const [activas, setActivas] = useState(() => new Set(ramas.map((r) => r.clave)));
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const [vista, setVista] = useState(VISTA_INICIAL);
  const [, setCuadro] = useState(0);
  const [foco, setFoco] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const grafo = useRef<{ nodos: Nodo[]; aristas: Arista[] }>({ nodos: [], aristas: [] });
  const arrastre = useRef<{ id: string | null; movio: boolean; px: number; py: number } | null>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const animando = useRef(false);

  const animar = useCallback(() => {
    if (animando.current) return;
    animando.current = true;
    let vueltas = 0;
    const cuadro = () => {
      const energia = paso(grafo.current.nodos, grafo.current.aristas, arrastre.current?.id ?? null);
      setCuadro((c) => c + 1);
      vueltas++;
      if ((energia > 0.5 || arrastre.current?.id) && vueltas < 600) requestAnimationFrame(cuadro);
      else animando.current = false;
    };
    requestAnimationFrame(cuadro);
  }, []);

  // Rearma el grafo al cambiar filtros o ramas abiertas, conservando dónde quedó cada nodo.
  useMemo(() => {
    const previos = new Map(grafo.current.nodos.map((n) => [n.id, n]));
    grafo.current = armar(ramas, activas, abiertas, previos);
    // Primera vez: se acomoda antes de dibujar, para no ver el salto.
    if (previos.size === 0) for (let i = 0; i < 250; i++) paso(grafo.current.nodos, grafo.current.aristas, null);
  }, [ramas, activas, abiertas]);
  useEffect(() => {
    animar();
  }, [activas, abiertas, animar]);

  /** Del punto de la pantalla al sistema de coordenadas del mapa. */
  const aMapa = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: vista.x + ((cx - r.left) / r.width) * vista.w, y: vista.y + ((cy - r.top) / r.height) * vista.h };
  };

  const zoom = (factor: number, cx?: number, cy?: number) => {
    setVista((v) => {
      const w = Math.min(Math.max(v.w * factor, 300), 3000);
      const h = (w * v.h) / v.w;
      const r = svg.current?.getBoundingClientRect();
      const fx = r && cx !== undefined ? (cx - r.left) / r.width : 0.5;
      const fy = r && cy !== undefined ? (cy! - r.top) / r.height : 0.5;
      return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
    });
  };

  // La rueda acerca el mapa sin mover la página.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  });

  const alPresionar = (e: React.PointerEvent, id: string | null) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    arrastre.current = { id, movio: false, px: e.clientX, py: e.clientY };
    if (id) animar();
  };

  const alMover = (e: React.PointerEvent) => {
    const antes = punteros.current.get(e.pointerId);
    if (!antes) return;
    // Dos dedos: acercar o alejar.
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      const otro = a === antes ? b : a;
      const d0 = Math.hypot(antes.x - otro.x, antes.y - otro.y);
      const d1 = Math.hypot(e.clientX - otro.x, e.clientY - otro.y);
      punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (d0 > 0 && d1 > 0) zoom(d0 / d1, (e.clientX + otro.x) / 2, (e.clientY + otro.y) / 2);
      return;
    }
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const a = arrastre.current;
    if (!a) return;
    if (Math.hypot(e.clientX - a.px, e.clientY - a.py) > 4) a.movio = true;
    if (a.id) {
      const n = grafo.current.nodos.find((x) => x.id === a.id);
      if (n) {
        const p = aMapa(e.clientX, e.clientY);
        n.x = p.x;
        n.y = p.y;
        n.fijo = true;
        setCuadro((c) => c + 1);
      }
    } else {
      const r = svg.current!.getBoundingClientRect();
      setVista((v) => ({ ...v, x: v.x - ((e.clientX - antes.x) / r.width) * v.w, y: v.y - ((e.clientY - antes.y) / r.height) * v.h }));
    }
  };

  const alSoltar = (e: React.PointerEvent, nodo?: Nodo) => {
    punteros.current.delete(e.pointerId);
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || a.movio || !nodo) return;
    // Un toque sin arrastrar: la fuente se abre o se recoge; un elemento lleva a donde se edita.
    if (nodo.tipo === "rama") {
      setAbiertas((s) => {
        const n = new Set(s);
        if (n.has(nodo.rama!)) n.delete(nodo.rama!);
        else n.add(nodo.rama!);
        return n;
      });
    } else if (nodo.href) {
      window.location.href = nodo.href;
    } else if (nodo.rama) {
      setAbiertas((s) => new Set(s).add(nodo.rama!));
    }
  };

  const centrar = () => {
    for (const n of grafo.current.nodos) n.fijo = false;
    setVista(VISTA_INICIAL);
    animar();
  };

  const { nodos, aristas } = grafo.current;
  const porId = new Map(nodos.map((n) => [n.id, n]));
  // Resaltado: el nodo en foco, su fuente y el centro.
  const enFoco = (id: string) => {
    if (!foco) return true;
    const f = porId.get(foco);
    const n = porId.get(id);
    if (!f || !n) return true;
    if (n.tipo === "centro") return true;
    return n.rama === f.rama || f.tipo === "centro";
  };

  return (
    <figure className="mapa-cerebro">
      <div className="mapa-controles">
        <div className="mapa-filtros" role="group" aria-label="Mostrar u ocultar fuentes">
          {ramas.map((r) => (
            <button
              key={r.clave}
              type="button"
              className={`mapa-filtro tono-${r.tono}`}
              aria-pressed={activas.has(r.clave)}
              onClick={() =>
                setActivas((s) => {
                  const n = new Set(s);
                  if (n.has(r.clave)) n.delete(r.clave);
                  else n.add(r.clave);
                  return n;
                })
              }
            >
              {r.nombre} <span>{r.hojas.length}</span>
            </button>
          ))}
        </div>
        <div className="mapa-zoom">
          <button type="button" onClick={() => zoom(1 / 1.25)} aria-label="Acercar">
            +
          </button>
          <button type="button" onClick={() => zoom(1.25)} aria-label="Alejar">
            −
          </button>
          <button type="button" onClick={centrar}>
            Centrar
          </button>
        </div>
      </div>

      <svg
        ref={svg}
        viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`}
        role="img"
        aria-label="Mapa de lo que sabe la asistente y de dónde lo aprende"
        onPointerDown={(e) => alPresionar(e, null)}
        onPointerMove={alMover}
        onPointerUp={(e) => alSoltar(e)}
        onPointerCancel={(e) => alSoltar(e)}
      >
        {aristas.map((e) => {
          const a = porId.get(e.de)!;
          const b = porId.get(e.a)!;
          return (
            <line
              key={`${e.de}-${e.a}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={`arista tono-${b.tono ?? "gris"}${a.tipo === "centro" ? " fuerte" : ""}${enFoco(b.id) ? "" : " apagada"}`}
            />
          );
        })}
        {nodos.map((n) => {
          const derecha = n.x >= 0;
          return (
            <g
              key={n.id}
              className={`nodo nodo-${n.tipo} tono-${n.tono ?? "verde"}${enFoco(n.id) ? "" : " apagada"}`}
              transform={`translate(${n.x} ${n.y})`}
              onPointerDown={(e) => alPresionar(e, n.id)}
              onPointerUp={(e) => alSoltar(e, n)}
              onPointerEnter={() => setFoco(n.id)}
              onPointerLeave={() => setFoco(null)}
              tabIndex={0}
              role="button"
              aria-label={n.texto}
              onKeyDown={(e) => {
                if (e.key === "Enter" && n.href) window.location.href = n.href;
              }}
            >
              <title>{n.texto}</title>
              {n.tipo === "centro" && (
                <>
                  <circle r={54} />
                  <text textAnchor="middle" y={6} className="centro-texto">
                    {n.texto}
                  </text>
                </>
              )}
              {n.tipo === "rama" && (
                <>
                  <circle r={40} />
                  <text textAnchor="middle" y={0} className="rama-numero">
                    {n.total}
                  </text>
                  <text textAnchor="middle" y={18} className="rama-nombre">
                    {n.texto}
                  </text>
                </>
              )}
              {n.tipo === "hoja" && (
                <>
                  <circle r={8} />
                  <text x={derecha ? 14 : -14} y={5} textAnchor={derecha ? "start" : "end"} className="hoja-texto">
                    {corto(n.texto, foco === n.id ? 80 : 26)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="suave">
        Arrastra los círculos o el mapa, acerca con la rueda o con dos dedos. Toca una fuente para abrirla o recogerla y un
        elemento para ir a él. En ámbar, lo que todavía no sabe.
      </figcaption>
    </figure>
  );
}
