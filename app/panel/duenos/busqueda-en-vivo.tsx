"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  busquedaEnCurso,
  CANAL,
  leerMensajeDeExtension,
  textoBusqueda,
  type EstadoBusquedaExt,
  type OrdenBusqueda,
} from "@/lib/panel/extension-instalar";
import "./busqueda.css";

// La búsqueda de dueños en vivo, desde el panel: "Buscando ahora · página 3 de 12" con Pausar/Seguir y Detener, o
// "Buscar ahora" cuando no está corriendo. Habla con la extensión por el mismo canal de la instalación (window.postMessage
// a esta misma ventana y origen; el content script extension/panel.js valida y pasa la orden). La página solo puede
// pedir estado, pausar, seguir, detener o buscar, sin parámetros.

const CADA_MS = 2500;
/** Un resultado (terminada, detenida, error) se sigue mostrando un rato. */
const RESULTADO_MS = 30 * 60_000;

function pedir(orden: OrdenBusqueda): Promise<EstadoBusquedaExt | null> {
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

export function BusquedaEnVivo({ asistente }: { asistente: string }) {
  const [estado, setEstado] = useState<EstadoBusquedaExt | null>(null);
  const [ocupado, setOcupado] = useState<OrdenBusqueda | null>(null);
  const [ahora, setAhora] = useState(0);
  const vivo = useRef(true);

  const mirar = useCallback(async () => {
    const e = await pedir("estado");
    if (!vivo.current) return;
    setEstado(e);
    setAhora(Date.now());
  }, []);

  useEffect(() => {
    vivo.current = true;
    const primera = setTimeout(() => void mirar(), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void mirar();
    }, CADA_MS);
    return () => {
      vivo.current = false;
      clearTimeout(primera);
      clearInterval(t);
    };
  }, [mirar]);

  async function ordenar(orden: OrdenBusqueda) {
    setOcupado(orden);
    const e = await pedir(orden);
    if (e) {
      setEstado(e);
      setAhora(Date.now());
    }
    setOcupado(null);
  }

  // Sin respuesta (versión anterior o la extensión se recargó): no se muestra nada.
  if (!estado || !ahora) return null;
  const enCurso = busquedaEnCurso(estado, ahora);

  if (enCurso) {
    const t = textoBusqueda(estado);
    const avance = estado.total ? Math.min(100, Math.round((estado.pagina / estado.total) * 100)) : 0;
    return (
      <div className="busq-vivo" data-fase={estado.fase} role="status" aria-live="polite" data-patty="duenos-busqueda">
        <span className="busq-vivo-punto" aria-hidden />
        <div className="busq-vivo-texto">
          <strong>{t.titulo}</strong>
          {t.detalle && <span>{t.detalle}</span>}
          {estado.total > 0 && (
            <span className="busq-vivo-barra" aria-hidden>
              <span style={{ width: `${avance}%` }} />
            </span>
          )}
        </div>
        <div className="busq-vivo-acciones">
          {estado.fase === "buscando" && (
            <button type="button" onClick={() => void ordenar("pausar")} disabled={!!ocupado} data-patty="duenos-pausar">
              Pausar
            </button>
          )}
          {(estado.fase === "pausada" || estado.fase === "verificacion") && (
            <button type="button" className="primario" onClick={() => void ordenar("seguir")} disabled={!!ocupado} data-patty="duenos-seguir">
              Seguir
            </button>
          )}
          {estado.fase !== "revisando" && (
            <button type="button" className="peligro" onClick={() => void ordenar("detener")} disabled={!!ocupado} data-patty="duenos-detener">
              {ocupado === "detener" ? "Deteniendo…" : "Detener"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const reciente = ["terminada", "detenida", "error"].includes(estado.fase) && estado.mensaje && ahora - estado.latido < RESULTADO_MS;
  return (
    <div className="busq-vivo busq-vivo-lista">
      {reciente && (
        <p className={estado.fase === "error" ? "aviso" : "suave"} role="status">
          {estado.mensaje}
        </p>
      )}
      <div className="busq-vivo-fila">
        <button type="button" className="primario" onClick={() => void ordenar("buscar")} disabled={!!ocupado} data-patty="duenos-buscar-ahora">
          {ocupado === "buscar" ? "Abriendo Encuentra24…" : "Buscar ahora"}
        </button>
        <span className="suave">
          Se abre una pestaña de Encuentra24 y verás a {asistente} trabajar. La puedes pausar o detener cuando quieras.
        </span>
      </div>
    </div>
  );
}
