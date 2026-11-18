"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sumarPaso, type PasoVivo } from "@/lib/panel/extension-hero";
import {
  busquedaEnCurso,
  CANAL,
  ORDENES_BUSQUEDA,
  leerMensajeDeExtension,
  type EstadoBusquedaExt,
  type OrdenBusqueda,
} from "@/lib/panel/extension-instalar";

// La búsqueda de dueños en vivo, desde el panel, como en el panel lateral de la extensión: anillo de avance, lo que
// está haciendo, el tiempo que falta, Pausar / Seguir / Detener y una línea con los últimos pasos (la arma la página
// con lo que la extensión dice en cada consulta). Habla con la extensión por el mismo canal de la instalación
// (window.postMessage a esta misma ventana y origen; el content script extension/panel.js valida y pasa la orden). La
// página solo puede pedir estado, pausar, seguir, detener o buscar, sin parámetros; lo que vuelve se valida en
// leerMensajeDeExtension. La forma está en vistas.tsx (VistaEnVivo).

const CADA_MS = 2500;
/** Un resultado (terminada, detenida, error) se sigue mostrando un rato. */
const RESULTADO_MS = 30 * 60_000;

function pedir(orden: OrdenBusqueda): Promise<EstadoBusquedaExt | null> {
  // Solo las órdenes conocidas (la extensión las vuelve a validar).
  if (!ORDENES_BUSQUEDA.includes(orden)) return Promise.resolve(null);
  const origen = window.location.origin;
  const pedido = `b${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolver) => {
    const tope = setTimeout(() => {
      window.removeEventListener("message", oir);
      resolver(null);
    }, 4000);
    function oir(e: MessageEvent) {
      const m = leerMensajeDeExtension(e, window, origen);
      if (!m || m.tipo !== "busqueda" || m.pedido !== pedido) return;
      clearTimeout(tope);
      window.removeEventListener("message", oir);
      resolver(m.ok ? m.estado : null);
    }
    window.addEventListener("message", oir);
    window.postMessage({ fuente: CANAL.pagina, tipo: "busqueda", orden, pedido }, origen);
  });
}

export interface BusquedaViva {
  estado: EstadoBusquedaExt | null;
  /** Hay una búsqueda corriendo (o en pausa) en este navegador. */
  enCurso: boolean;
  /** Lo que terminó hace poco (terminada, detenida o error), para mostrarlo un rato. */
  resultado: { texto: string; error: boolean } | null;
  pasos: PasoVivo[];
  ocupado: OrdenBusqueda | null;
  ordenar: (o: OrdenBusqueda) => Promise<void>;
}

/** Consulta la búsqueda cada 2,5 s con la pestaña a la vista. Sin `activo` (no conectada o sin extensión) no pregunta. */
export function useBusquedaEnVivo(activo: boolean): BusquedaViva {
  const [estado, setEstado] = useState<EstadoBusquedaExt | null>(null);
  const [ocupado, setOcupado] = useState<OrdenBusqueda | null>(null);
  const [ahora, setAhora] = useState(0);
  const [pasos, setPasos] = useState<PasoVivo[]>([]);
  const vivo = useRef(true);

  const recibir = useCallback((e: EstadoBusquedaExt | null) => {
    if (!vivo.current) return;
    const t = Date.now();
    setEstado(e);
    setAhora(t);
    if (e && busquedaEnCurso(e, t)) setPasos((p) => sumarPaso(p, e.fase === "buscando" ? e.haciendo : "", t));
  }, []);

  useEffect(() => {
    if (!activo) return;
    vivo.current = true;
    const primera = setTimeout(() => void pedir("estado").then(recibir), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void pedir("estado").then(recibir);
    }, CADA_MS);
    return () => {
      vivo.current = false;
      clearTimeout(primera);
      clearInterval(t);
    };
  }, [activo, recibir]);

  const ordenar = useCallback(
    async (orden: OrdenBusqueda) => {
      setOcupado(orden);
      if (orden === "buscar") setPasos([]);
      const e = await pedir(orden);
      if (e) recibir(e);
      setOcupado(null);
    },
    [recibir],
  );

  const enCurso = !!estado && !!ahora && busquedaEnCurso(estado, ahora);
  const reciente =
    !!estado && !enCurso && ["terminada", "detenida", "error"].includes(estado.fase) && !!estado.mensaje && ahora - estado.latido < RESULTADO_MS;
  return {
    estado,
    enCurso,
    resultado: reciente && estado ? { texto: estado.mensaje, error: estado.fase === "error" } : null,
    pasos,
    ocupado,
    ordenar,
  };
}
