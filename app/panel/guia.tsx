"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// Patty lleva al corredor de la mano: abre pantallas, mueve un cursor hasta el botón o el campo, lo
// resalta con un texto, hace clic para abrir secciones y deja texto escrito en un campo. Nunca guarda,
// envía ni borra: los clics solo valen sobre enlaces y pestañas, nunca sobre botones de formularios.

export type Paso =
  | { tipo: "ir"; ruta: string }
  | { tipo: "señalar"; lugar: string; texto: string }
  | { tipo: "tocar"; lugar: string }
  | { tipo: "escribir"; lugar: string; texto: string };

const PASO = /^<<\s*(ir|señalar|senalar|tocar|escribir)\s+([^|>]+?)\s*(?:\|\s*([^>]*?)\s*)?>>\s*$/gim;

/** Separa el texto que se lee de los pasos que Patty pide hacer en pantalla. */
export function separarPasos(texto: string): { texto: string; pasos: Paso[] } {
  const pasos: Paso[] = [];
  const limpio = texto.replace(PASO, (_, accion: string, objetivo: string, extra?: string) => {
    const a = accion.toLowerCase();
    const o = objetivo.trim();
    if (a === "ir") {
      if (/^\/panel(\/[\w\-/?=&.]*)?$/.test(o)) pasos.push({ tipo: "ir", ruta: o });
    } else if (/^[a-z0-9-]+$/.test(o)) {
      if (a === "tocar") pasos.push({ tipo: "tocar", lugar: o });
      else if (a === "escribir") pasos.push({ tipo: "escribir", lugar: o, texto: (extra ?? "").slice(0, 500) });
      else pasos.push({ tipo: "señalar", lugar: o, texto: (extra ?? "").slice(0, 120) });
    }
    return "";
  });
  return { texto: limpio.replace(/\n{3,}/g, "\n\n").trim(), pasos: pasos.slice(0, 8) };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** El elemento visible con ese lugar (en el teléfono el menú de abajo y en computadora el de la izquierda). */
function buscar(lugar: string): HTMLElement | null {
  const todos = [...document.querySelectorAll<HTMLElement>(`[data-patty="${lugar}"]`)];
  return todos.find((e) => e.offsetParent !== null || e.getClientRects().length > 0) ?? null;
}

async function esperarElemento(lugar: string, ms = 6000): Promise<HTMLElement | null> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const e = buscar(lugar);
    if (e) return e;
    await esperar(150);
  }
  return null;
}

/** Solo se hace clic en enlaces, pestañas y secciones plegables: nunca en botones que guardan o envían. */
function sePuedeTocar(e: HTMLElement): boolean {
  if (e.closest("form") && (e.tagName === "BUTTON" || (e as HTMLInputElement).type === "submit")) return false;
  return e.tagName === "A" || e.tagName === "SUMMARY" || e.getAttribute("role") === "tab";
}

function escribirEn(e: HTMLElement, texto: string) {
  if (!(e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement)) return;
  if (e instanceof HTMLInputElement && ["checkbox", "radio", "submit", "button", "hidden", "file"].includes(e.type)) return;
  // El valor se pone con el setter nativo para que React y el formulario lo vean como escrito.
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(e, texto);
  e.dispatchEvent(new Event("input", { bubbles: true }));
  e.dispatchEvent(new Event("change", { bubbles: true }));
  e.focus({ preventScroll: true });
}

interface Marca {
  x: number;
  y: number;
  caja: { top: number; left: number; width: number; height: number } | null;
  texto: string | null;
  clic: boolean;
}

/** La respuesta en texto corto para el globo (sin markdown ni enlaces). */
export function resumenParaGlobo(texto: string, max = 260): string {
  const plano = texto
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:#{1,6}|>|[-*]|\d+\.)\s+/gm, "")
    .replace(/[*_`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plano.length > max ? `${plano.slice(0, max - 1).trimEnd()}…` : plano;
}

/**
 * La guía. `alEmpezar` se llama al arrancar y dice si el chat quedó fuera de la vista (en el teléfono el chat
 * flotante se cierra; desde la pantalla de Patty se sale a otra): entonces la respuesta se muestra en un globo
 * aparte, con "Ver en el chat" (`alVerChat`), para que no se pierda al cambiar de pantalla.
 */
export function useGuia(nombre: string, alEmpezar: (pasos: Paso[]) => boolean, alVerChat?: () => void) {
  const router = useRouter();
  const [marca, setMarca] = useState<Marca | null>(null);
  const [activa, setActiva] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  const cancelada = useRef(false);
  const objetivo = useRef<HTMLElement | null>(null);
  // Si la página se mueve, el resaltado sigue al elemento.
  useEffect(() => {
    if (!marca?.caja) return;
    const seguir = () => {
      const e = objetivo.current;
      if (!e) return;
      const r = e.getBoundingClientRect();
      setMarca((m) => (m ? { ...m, x: r.left + r.width / 2, y: r.top + r.height / 2, caja: { top: r.top, left: r.left, width: r.width, height: r.height } } : m));
    };
    window.addEventListener("scroll", seguir, true);
    window.addEventListener("resize", seguir);
    return () => {
      window.removeEventListener("scroll", seguir, true);
      window.removeEventListener("resize", seguir);
    };
  }, [marca?.caja]);

  const apuntar = useCallback(async (e: HTMLElement, texto: string | null) => {
    objetivo.current = e;
    e.scrollIntoView({ block: "center", behavior: "smooth" });
    await esperar(450);
    const r = e.getBoundingClientRect();
    setMarca((m) => ({
      x: r.left + Math.min(r.width / 2, 60),
      y: r.top + r.height / 2,
      caja: { top: r.top, left: r.left, width: r.width, height: r.height },
      texto,
      clic: false,
      ...(m ? {} : {}),
    }));
    await esperar(800);
  }, []);

  const guiar = useCallback(
    async (pasos: Paso[], respuesta?: string) => {
      if (!pasos.length) return;
      cancelada.current = false;
      setActiva(true);
      const fueraDeVista = alEmpezar(pasos);
      setNota(fueraDeVista && respuesta ? resumenParaGlobo(respuesta) : null);
      // El cursor sale de donde vive la asistente: el centro de la barra de abajo en el teléfono, la esquina en computadora.
      const telefono = window.innerWidth < 900;
      setMarca({ x: telefono ? window.innerWidth / 2 : window.innerWidth - 60, y: window.innerHeight - (telefono ? 48 : 60), caja: null, texto: null, clic: false });
      await esperar(200);
      for (const p of pasos) {
        if (cancelada.current) break;
        if (p.tipo === "ir") {
          const destino = p.ruta.split("?")[0];
          if (window.location.pathname !== destino || p.ruta.includes("?")) {
            router.push(p.ruta);
            const fin = Date.now() + 8000;
            while (window.location.pathname !== destino && Date.now() < fin) await esperar(150);
            await esperar(500);
          }
          continue;
        }
        const e = await esperarElemento(p.lugar);
        if (!e) continue;
        if (p.tipo === "señalar") {
          await apuntar(e, p.texto || null);
          await esperar(1200);
        } else if (p.tipo === "tocar") {
          await apuntar(e, null);
          if (!sePuedeTocar(e)) continue;
          setMarca((m) => (m ? { ...m, clic: true } : m));
          await esperar(250);
          e.click();
          setMarca((m) => (m ? { ...m, clic: false } : m));
          await esperar(900);
        } else if (p.tipo === "escribir") {
          await apuntar(e, "Lo dejé escrito; revísalo");
          escribirEn(e, p.texto);
          await esperar(1000);
        }
      }
      setActiva(false);
    },
    [alEmpezar, apuntar, router],
  );

  /** Para el cursor y el resaltado; el globo con la respuesta queda hasta que lo cierre. */
  const soltar = useCallback(() => {
    cancelada.current = true;
    setActiva(false);
    setMarca(null);
    objetivo.current = null;
  }, []);

  const terminar = useCallback(() => {
    soltar();
    setNota(null);
  }, [soltar]);

  const globo = nota ? (
    <div className="guia-nota" role="status">
      <strong>{nombre}</strong>
      <span>{nota}</span>
      <span className="guia-nota-botones">
        {alVerChat && (
          <button
            type="button"
            onClick={() => {
              terminar();
              alVerChat();
            }}
          >
            Ver en el chat
          </button>
        )}
        <button type="button" className="secundario" onClick={() => setNota(null)}>
          Cerrar
        </button>
      </span>
    </div>
  ) : null;

  const capa = marca || nota ? (
    <div className="guia" aria-live="polite">
      {globo}
      {marca && (
      <>
      {marca.caja && (
        <span
          className="guia-resalte"
          style={{ top: marca.caja.top - 6, left: marca.caja.left - 6, width: marca.caja.width + 12, height: marca.caja.height + 12 }}
        />
      )}
      <span className={`guia-cursor${marca.clic ? " clic" : ""}`} style={{ transform: `translate(${marca.x}px, ${marca.y}px)` }} aria-hidden>
        <svg width="28" height="28" viewBox="0 0 24 24">
          <path d="M4 2l16 9-7 2-3 7z" fill="#111b21" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span className="guia-nombre">{nombre}</span>
      </span>
      {marca.texto && marca.caja && (
        <span
          className="guia-texto"
          style={{
            top: Math.min(window.innerHeight - 70, marca.caja.top + marca.caja.height + 14),
            left: Math.max(12, Math.min(window.innerWidth - 292, marca.caja.left)),
          }}
        >
          {marca.texto}
          <button type="button" onClick={soltar}>
            Entendido
          </button>
        </span>
      )}
      {activa && (
        <button type="button" className="guia-parar" onClick={soltar}>
          Parar
        </button>
      )}
      </>
      )}
    </div>
  ) : null;

  return { guiar, terminar, capa, guiando: activa };
}
