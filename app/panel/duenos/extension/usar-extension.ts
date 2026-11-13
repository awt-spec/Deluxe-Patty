"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CANAL,
  detectarEntorno,
  estadoExtension,
  leerMensajeDeExtension,
  type DelServidor,
  type Deteccion,
  type Entorno,
  type EstadoExtension,
  type MensajeDeExtension,
} from "@/lib/panel/extension-instalar";
import { pedirCodigoExtension } from "../acciones";
import type { Conexion } from "./vista";

// Habla con la extensión instalada en este navegador por su content script (extension/panel.js), que solo corre
// en /panel/duenos*. Ver lib/panel/extension-instalar.ts.

type NavegadorConPistas = Navigator & {
  userAgentData?: { platform?: string; mobile?: boolean; brands?: { brand: string }[] };
  brave?: unknown;
};

let entornoGuardado: Entorno | null = null;
function leerEntorno(): Entorno {
  if (!entornoGuardado) {
    const n = navigator as NavegadorConPistas;
    entornoGuardado = detectarEntorno(n.userAgent, {
      plataforma: n.userAgentData?.platform,
      movil: n.userAgentData?.mobile,
      marcas: n.userAgentData?.brands?.map((b) => b.brand),
      toques: n.maxTouchPoints,
      brave: !!n.brave,
    });
  }
  return entornoGuardado;
}
const sinCambios = () => () => {};

/** El aparato y el navegador (null mientras se dibuja en el servidor). */
export function useEntorno(): Entorno | null {
  return useSyncExternalStore(sinCambios, leerEntorno, () => null);
}

/**
 * Chrome pone el content script cuando se carga el documento. Si se llegó a esta pantalla navegando dentro del
 * panel desde otra que no es /panel/duenos*, el script no está y la página no puede saber si hay extensión.
 */
export function documentoDetectable(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const inicial = new URL(nav?.name ?? window.location.href);
    return inicial.pathname.startsWith("/panel/duenos");
  } catch {
    return true;
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OpcionesExtension {
  servidor: DelServidor;
  version: string;
  demo: boolean;
  /** Nombre del corredor, para la demo. */
  corredor: string;
  /** Conectar en cuanto se vea la extensión instalada sin conectar (en la pantalla de instalación). */
  autoconectar: boolean;
  /** Si no se puede detectar (se llegó navegando), volver a cargar la página para que entre el content script. */
  recargarSiNoSeVe?: boolean;
}

export function useExtension(o: OpcionesExtension) {
  const router = useRouter();
  const [deteccion, setDeteccion] = useState<Deteccion>({ estado: "buscando" });
  const [conexion, setConexion] = useState<Conexion>({ fase: "nada" });
  const pendientes = useRef(new Map<string, (m: MensajeDeExtension | null) => void>());
  const enCurso = useRef(false);
  const intentoAuto = useRef(false);
  const opciones = useRef(o);
  useEffect(() => {
    opciones.current = o;
  });

  const conectar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setConexion({ fase: "conectando" });
    try {
      if (opciones.current.demo) {
        // En la demo no se pide código ni se habla con la extensión: solo se muestra cómo se vería.
        await esperar(1800);
        setConexion({ fase: "lista", corredor: opciones.current.corredor });
        return;
      }
      const r = await pedirCodigoExtension({});
      if (!r.codigo) {
        setConexion({ fase: "error", mensaje: r.error ?? "No se pudo crear el código. Vuelve a intentarlo." });
        return;
      }
      const pedido = Math.random().toString(36).slice(2, 12) || "p";
      const respuesta = await new Promise<MensajeDeExtension | null>((resolver) => {
        const tope = setTimeout(() => resolver(null), 25_000);
        pendientes.current.set(pedido, (m) => {
          clearTimeout(tope);
          resolver(m);
        });
        // El código va solo a esta misma ventana y origen: lo lee el content script de la extensión.
        window.postMessage({ fuente: CANAL.pagina, tipo: "conectar", codigo: r.codigo, pedido }, window.location.origin);
      });
      pendientes.current.delete(pedido);
      if (!respuesta || respuesta.tipo !== "resultado") {
        setConexion({ fase: "error", mensaje: "La extensión no respondió. Recarga la página y vuelve a intentarlo, o hazlo a mano." });
      } else if (!respuesta.ok) {
        setConexion({ fase: "error", mensaje: respuesta.mensaje || "No se pudo conectar. Vuelve a intentarlo." });
      } else {
        setConexion({ fase: "lista", corredor: respuesta.corredor });
        router.refresh();
      }
    } catch {
      setConexion({ fase: "error", mensaje: "No se pudo conectar. Vuelve a intentarlo." });
    } finally {
      enCurso.current = false;
    }
  }, [router]);

  useEffect(() => {
    if (!documentoDetectable()) {
      if (opciones.current.recargarSiNoSeVe) {
        window.location.replace(window.location.href);
        return;
      }
      const t = setTimeout(() => setDeteccion({ estado: "no_se_sabe" }), 0);
      return () => clearTimeout(t);
    }
    const origen = window.location.origin;
    const oir = (e: MessageEvent) => {
      const m = leerMensajeDeExtension(e, window, origen);
      if (!m) return;
      if (m.tipo === "resultado") {
        pendientes.current.get(m.pedido)?.(m);
        return;
      }
      setDeteccion({ estado: "si", version: m.version, conectada: m.conectada, corredor: m.corredor });
      const op = opciones.current;
      const falta = !m.conectada || !op.servidor.conectada;
      if (op.autoconectar && !op.demo && falta && !intentoAuto.current) {
        intentoAuto.current = true;
        void conectar();
      }
    };
    window.addEventListener("message", oir);
    const hola = () => window.postMessage({ fuente: CANAL.pagina, tipo: "hola" }, origen);
    hola();
    let veces = 0;
    const intervalo = setInterval(() => {
      veces++;
      if (veces >= 5) {
        clearInterval(intervalo);
        setDeteccion((d) => (d.estado === "buscando" ? { estado: "no" } : d));
        return;
      }
      hola();
    }, 400);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener("message", oir);
    };
  }, [conectar]);

  const estado: EstadoExtension = useMemo(() => {
    const base = estadoExtension(deteccion, o.servidor, o.version);
    // Recién conectada, antes de que el servidor vuelva a dibujar la página.
    if (conexion.fase === "lista" && (base.tipo === "sin_conectar" || base.tipo === "no_instalada")) {
      return { tipo: "conectada", corredor: conexion.corredor, ultimaBusquedaDias: o.servidor.ultimaBusquedaDias };
    }
    return base;
  }, [deteccion, conexion, o.servidor, o.version]);

  return { estado, conexion, conectar };
}
