"use client";

import { dondeInstalar, estadoExtension, type DelServidor, type Entorno } from "@/lib/panel/extension-instalar";
import { BusquedaEnVivo } from "./busqueda-en-vivo";
import { useEntorno, useExtension } from "./extension/usar-extension";
import { TarjetaEstado } from "./extension/vista";

// Estado de la extensión arriba de "Buscar dueños desde Chrome": lo que sabe el servidor (conectada, última
// búsqueda) más lo que ve la página en este navegador (instalada, versión). Con el botón que corresponde.

interface Props {
  servidor: DelServidor;
  version: string;
  demo: boolean;
  corredor: string;
  /** Nombre de la asistente, para "verás a Patty trabajar". */
  asistente: string;
  /** El formulario de Desconectar (acción del servidor), para cuando está conectada. */
  desconectar: React.ReactNode;
}

const RUTA = "/panel/duenos/extension";

export function EstadoExtensionDuenos(p: Props) {
  const entorno = useEntorno();
  if (!entorno) {
    // Primer dibujo: solo lo del servidor.
    return <TarjetaEstado estado={estadoExtension({ estado: "no_se_sabe" }, p.servidor, p.version)} conexion={{ fase: "nada" }} demo={p.demo} />;
  }
  return <ConNavegador {...p} entorno={entorno} />;
}

function ConNavegador({ servidor, version, demo, corredor, asistente, desconectar, entorno }: Props & { entorno: Entorno }) {
  const aqui = dondeInstalar(entorno) === "aqui";
  const { estado: visto, conexion, conectar } = useExtension({ servidor, version, demo, corredor, autoconectar: false });
  // En el teléfono o en otro navegador no hay extensión que mirar: vale lo del servidor.
  const estado = aqui ? visto : estadoExtension({ estado: "no_se_sabe" }, servidor, version);
  // Enlace normal (no de Next): la página de instalación necesita cargarse entera para que entre la extensión.
  const ir = (texto: string, principal = true) => (
    <a href={RUTA} className={principal ? "boton primario" : "boton"} data-patty="duenos-extension">
      {texto}
    </a>
  );
  let accion: React.ReactNode = null;
  if (demo) accion = ir("Ver cómo se instala", false);
  else if (conexion.fase === "conectando") accion = null;
  else if (estado.tipo === "conectada") accion = desconectar;
  else if (estado.tipo === "sin_conectar")
    accion = (
      <button type="button" className="primario" onClick={() => void conectar()} data-patty="duenos-extension">
        Conectar
      </button>
    );
  else if (estado.tipo === "nueva_version" || estado.tipo === "vieja") accion = ir("Actualizar");
  else if (estado.tipo !== "buscando") accion = ir(aqui ? "Instalar" : "Cómo instalarla");
  return (
    <>
      <TarjetaEstado estado={estado} conexion={conexion} demo={demo}>
        {accion}
      </TarjetaEstado>
      {/* Conectada y al día en este navegador: la búsqueda en vivo (Buscar ahora, o cómo va con Pausar y Detener). */}
      {aqui && !demo && estado.tipo === "conectada" && <BusquedaEnVivo asistente={asistente} />}
      {conexion.fase === "error" && (
        <p className="aviso" role="alert">
          {conexion.mensaje} <a href={RUTA}>Hazlo paso a paso</a>.
        </p>
      )}
    </>
  );
}
