"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { clasificarFalla, codigoDeFalla } from "@/lib/panel/fallas";
import { esRutaInterna } from "@/lib/panel/sesion-vencida";

// Pantalla de error en palabras de todos los días (la usan app/error.tsx y app/panel/error.tsx). Nada técnico a la
// vista: ni "TypeError: Failed to fetch" ni trazas; para soporte, un código corto dentro de "Detalle para soporte".
// Sin conexión lo dice, y lo escrito en los formularios sigue guardado en esta pestaña (ConservarBorrador).

/** `dentroDelPanel`: va dentro del <main> del panel (no abre otro). */
export function PantallaError({ error, reset, dentroDelPanel = false }: { error: Error & { digest?: string }; reset: () => void; dentroDelPanel?: boolean }) {
  const Caja = dentroDelPanel ? "section" : "main";
  const router = useRouter();
  const [enLinea, setEnLinea] = useState(true);
  const [ruta, setRuta] = useState<string | null>(null);

  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    const r = `${window.location.pathname}${window.location.search}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la dirección solo existe en el navegador.
    setRuta(esRutaInterna(r) ? r : null);
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);

  const falla = clasificarFalla(error, { enLinea });
  const reintentar = () =>
    startTransition(() => {
      // Vuelve a pedir los datos al servidor y a pintar la pantalla (reset solo no los pide de nuevo).
      router.refresh();
      reset();
    });

  return (
    <Caja className={dentroDelPanel ? "pantalla-error" : "panel pantalla-error"}>
      {falla === "sin-conexion" ? (
        <>
          <h1>Parece que no hay conexión</h1>
          <p>Lo que escribiste sigue aquí cuando vuelva. Revisa el wifi o los datos y toca «Reintentar».</p>
        </>
      ) : falla === "sesion" ? (
        <>
          <h1>Puede que tu sesión se haya cerrado</h1>
          <p>Entra de nuevo y sigues donde estabas. Lo que escribiste queda guardado en esta pestaña.</p>
        </>
      ) : (
        <>
          <h1>Algo no cargó bien</h1>
          <p>Vuelve a intentarlo. Si sigue pasando, avísale a soporte con el código de abajo.</p>
        </>
      )}
      <div className="botones" style={{ marginTop: 16 }}>
        {falla === "sesion" && (
          <a href={`/entrar?aviso=sesion${ruta ? `&volver=${encodeURIComponent(ruta)}` : ""}`} className="boton primario grande">
            Entrar de nuevo
          </a>
        )}
        <button type="button" className={falla === "sesion" ? "grande" : "primario grande"} onClick={reintentar}>
          Reintentar
        </button>
        <a href="/panel" className="boton grande">
          Volver a Inicio
        </a>
      </div>
      <details className="pantalla-error-detalle">
        <summary>Detalle para soporte</summary>
        <p className="suave">Código: {codigoDeFalla(error)}</p>
      </details>
    </Caja>
  );
}
