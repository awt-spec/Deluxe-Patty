"use client";

import { dondeInstalar, estadoExtension, type DelServidor, type Entorno } from "@/lib/panel/extension-instalar";
import {
  accionHero,
  encabezadoHero,
  pasosHero,
  textoProximaBusqueda,
  textoUltimaBusqueda,
  type AccionHero,
} from "@/lib/panel/extension-hero";
import type { EstadoEnergia } from "@/lib/ia/energia";
import { useBusquedaEnVivo } from "./busqueda-en-vivo";
import { useEntorno, useExtension } from "./extension/usar-extension";
import { VistaEnVivo, VistaHero } from "./vistas";

// La tarjeta de arriba de Dueños directos: lo que sabe el servidor (conectada, última búsqueda, dueños que trajo,
// energía) más lo que ve la página en este navegador (instalada, versión, si busca sola cada semana), con UNA acción
// que sigue. Si hay una búsqueda corriendo, la tarjeta muestra la búsqueda en vivo. Reglas en lib/panel/extension-hero.ts.

interface Props {
  servidor: DelServidor;
  version: string;
  demo: boolean;
  corredor: string;
  /** Nombre de la asistente, para "Patty está lista". */
  asistente: string;
  /** Fecha (ISO) de la última búsqueda terminada y cuántos dueños trajo. */
  ultima: { en: string | null; duenos: number };
  energia: EstadoEnergia | null;
  /** El formulario de Desconectar (acción del servidor), para cuando está conectada. */
  desconectar: React.ReactNode;
  /** Momento de la carga en el servidor (para que el primer dibujo y el del navegador coincidan). */
  ahora: number;
}

const RUTA = "/panel/duenos/extension";
const E24 = "https://www.encuentra24.com/costa-rica-es";

export function EstadoExtensionDuenos(p: Props) {
  const entorno = useEntorno();
  if (!entorno) return <Hero {...p} entorno={null} />;
  return <ConNavegador {...p} entorno={entorno} />;
}

function ConNavegador(p: Props & { entorno: Entorno }) {
  const aqui = dondeInstalar(p.entorno) === "aqui";
  const ext = useExtension({ servidor: p.servidor, version: p.version, demo: p.demo, corredor: p.corredor, autoconectar: false });
  return <Hero {...p} ext={aqui ? ext : null} />;
}

type Ext = ReturnType<typeof useExtension>;

function Hero({ entorno, ext, ...p }: Props & { entorno: Entorno | null; ext?: Ext | null }) {
  const lugar = entorno ? dondeInstalar(entorno) : null;
  // En el teléfono, en otro navegador o en el primer dibujo no hay extensión que mirar: vale lo del servidor.
  const estado = ext ? ext.estado : estadoExtension({ estado: "no_se_sabe" }, p.servidor, p.version);
  const conectando = ext?.conexion.fase === "conectando";
  const vista = !!ext?.vista;
  const conectada = estado.tipo === "conectada";
  const busqueda = useBusquedaEnVivo(!p.demo && vista && conectada);
  const enCurso = busqueda.enCurso && !!busqueda.estado;

  const cabeza = encabezadoHero({ estado, demo: p.demo, conectando, enCurso, lugar, asistente: p.asistente, version: p.version });
  const accion = accionHero({ demo: p.demo, lugar, estado, conectando, enCurso, version: p.version, vista });
  const semanal = ext?.semanal ?? null;
  const pasos = pasosHero({ estado, version: p.version, semanal, vista });
  const tieneDatos = !p.demo && (conectada || estado.tipo === "vieja" || estado.tipo === "nueva_version" || p.ultima.en !== null);

  const aviso = ext?.conexion.fase === "error" ? { texto: ext.conexion.mensaje, error: true } : busqueda.resultado;

  return (
    <VistaHero
      {...cabeza}
      pasos={pasos}
      ultima={tieneDatos ? { cuando: textoUltimaBusqueda(p.ultima.en, p.ahora), duenos: p.ultima.en ? p.ultima.duenos : 0 } : null}
      proxima={tieneDatos ? textoProximaBusqueda({ ultima: p.ultima.en, ahora: p.ahora, conectada: conectada || estado.tipo === "vieja" || (estado.tipo === "nueva_version" && estado.conectada), semanal }) : null}
      energia={p.demo ? null : p.energia}
      asistente={p.asistente}
      accion={accion}
      aviso={aviso}
      boton={<Boton accion={accion} ocupado={!!busqueda.ocupado} alConectar={() => void ext?.conectar()} alBuscar={() => void busqueda.ordenar("buscar")} />}
      secundario={
        p.demo ? null : conectada ? (
          <>
            <a href={RUTA} className="dd-enlace">
              Ver la instalación
            </a>
            {p.desconectar}
          </>
        ) : accion.tipo === "instalar" || accion.tipo === "actualizar" ? null : (
          <a href={RUTA} className="dd-enlace">
            Hazlo paso a paso
          </a>
        )
      }
      enVivo={enCurso && busqueda.estado ? <VistaEnVivo estado={busqueda.estado} pasos={busqueda.pasos} ocupado={busqueda.ocupado} alOrdenar={(o) => void busqueda.ordenar(o)} /> : null}
    />
  );
}

function Boton({ accion, ocupado, alConectar, alBuscar }: { accion: AccionHero; ocupado: boolean; alConectar: () => void; alBuscar: () => void }) {
  if (accion.tipo === "ninguna") return null;
  // Enlace normal (no de Next): la página de instalación necesita cargarse entera para que entre la extensión.
  if (accion.tipo === "instalar" || accion.tipo === "actualizar" || accion.tipo === "demo" || accion.tipo === "en_computadora") {
    return (
      <a href={RUTA} className={`boton grande ${accion.tipo === "demo" ? "" : "primario"}`} data-patty="duenos-extension">
        {accion.texto}
      </a>
    );
  }
  if (accion.tipo === "conectar") {
    return (
      <button type="button" className="primario grande" onClick={alConectar} data-patty="duenos-extension">
        {accion.texto}
      </button>
    );
  }
  if (accion.tipo === "abrir_e24") {
    return (
      <a href={E24} target="_blank" rel="noreferrer" className="boton primario grande" data-patty="duenos-abrir-e24">
        {accion.texto}
      </a>
    );
  }
  return (
    <button type="button" className="primario grande" onClick={alBuscar} disabled={ocupado} data-patty="duenos-buscar-ahora">
      {ocupado ? "Abriendo Encuentra24…" : accion.texto}
    </button>
  );
}
