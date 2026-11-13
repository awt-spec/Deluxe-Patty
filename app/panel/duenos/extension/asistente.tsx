"use client";

import { useEffect, useRef, useState } from "react";
import {
  anterior,
  direccionExtensiones,
  dondeInstalar,
  instalada,
  pasoInicial,
  pasoVisible,
  PASOS,
  pideActualizar,
  siguiente,
  type DelServidor,
  type Entorno,
  type Paso,
  type PasoActualizar,
} from "@/lib/panel/extension-instalar";
import { ConectarExtension } from "../conectar-extension";
import { useEntorno, useExtension } from "./usar-extension";
import { Actualizar, Asistente, PantallaOtroAparato, TarjetaEstado } from "./vista";

// Pantalla de instalación: decide qué mostrar (teléfono, otro navegador, actualizar o el paso a paso), recuerda
// el paso en este navegador y avanza solo cuando ve la extensión.

const CLAVE_PASO = "extension:paso";

function leerPaso(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_PASO);
  } catch {
    return null;
  }
}
function guardarPaso(p: Paso | null) {
  try {
    if (p) window.localStorage.setItem(CLAVE_PASO, p);
    else window.localStorage.removeItem(CLAVE_PASO);
  } catch {
    // sin almacenamiento: solo no se recuerda
  }
}

async function copiarTexto(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}

interface Props {
  servidor: DelServidor;
  version: string;
  demo: boolean;
  corredor: string;
}

export function InstalarExtension(p: Props) {
  const entorno = useEntorno();
  // En el servidor (y en el primer dibujo) no se sabe el aparato: un marco quieto del mismo alto.
  if (!entorno) return <div className="ext-esperando" aria-busy="true" />;
  return <Pantalla {...p} entorno={entorno} />;
}

function Pantalla({ servidor, version, demo, corredor, entorno }: Props & { entorno: Entorno }) {
  const lugar = dondeInstalar(entorno);
  const { estado, conexion, conectar } = useExtension({
    servidor,
    version,
    demo,
    corredor,
    autoconectar: lugar === "aqui",
    recargarSiNoSeVe: lugar === "aqui",
  });
  const [copiado, setCopiado] = useState(false);
  const [elegido, setElegido] = useState<Paso | null>(() => (PASOS.find((q) => q === leerPaso()) ?? null));
  const [volvioAtras, setVolvioAtras] = useState(false);
  const [sistema, setSistema] = useState<"windows" | "mac">(entorno.sistema === "mac" ? "mac" : "windows");
  const [pasoAct, setPasoAct] = useState<PasoActualizar>("descargar");
  // null: lo decide lo que se ve de la extensión; "instalar" o "actualizar": lo eligió la persona.
  const [modo, setModo] = useState<"instalar" | "actualizar" | null>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const dir = direccionExtensiones(entorno.navegador);

  // Si la persona volvió atrás o empezó de nuevo, se respeta su paso; si no, el que corresponde a lo que se ve.
  const paso: Paso = volvioAtras && elegido ? elegido : pasoVisible(pasoInicial(elegido, estado), estado, false);

  // El paso visible queda guardado para volver ahí si cierra la pestaña.
  useEffect(() => {
    if (estado.tipo !== "buscando") guardarPaso(paso);
  }, [paso, estado.tipo]);

  // Al cambiar de paso, el foco va al título (para lector de pantalla y teclado).
  const primerDibujo = useRef(true);
  useEffect(() => {
    if (primerDibujo.current) {
      primerDibujo.current = false;
      return;
    }
    tarjeta.current?.querySelector<HTMLElement>("#ext-paso-titulo")?.focus();
  }, [paso, pasoAct]);

  const copiar = async (t: string) => {
    if (await copiarTexto(t)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    }
  };
  const ir = (q: Paso) => {
    setElegido(q);
    guardarPaso(q);
  };

  if (lugar !== "aqui") {
    const enlace = typeof window === "undefined" ? "" : `${window.location.origin}/panel/duenos/extension`;
    const puedeCompartir = typeof navigator !== "undefined" && typeof navigator.share === "function";
    return (
      <>
        {!demo && servidor.conectada && <TarjetaEstado estado={estado} conexion={conexion} demo={false} />}
        <PantallaOtroAparato
          tipo={lugar}
          navegador={entorno.navegador}
          enlace={enlace}
          copiado={copiado}
          puedeCompartir={puedeCompartir}
          alCompartir={() => navigator.share({ title: "Instalar la extensión", text: "Abre este enlace en Chrome de tu computadora", url: enlace }).catch(() => {})}
          alCopiar={() => copiar(enlace)}
        />
      </>
    );
  }

  const actualizar =
    !demo && modo !== "instalar" && (pideActualizar(estado) || (modo === "actualizar" && !instalada(estado) && estado.tipo !== "buscando"));
  const accionEstado =
    estado.tipo === "sin_conectar" && conexion.fase !== "conectando" && !demo ? (
      <button type="button" className="primario" onClick={() => void conectar()} data-patty="extension-conectar-estado">
        Conectar
      </button>
    ) : null;

  return (
    <div ref={tarjeta}>
      <TarjetaEstado estado={estado} conexion={conexion} demo={demo}>
        {accionEstado}
      </TarjetaEstado>
      {actualizar ? (
        <Actualizar
          paso={pasoAct}
          estado={estado}
          navegador={entorno.navegador}
          sistema={sistema}
          copiada={copiado}
          version={version}
          acciones={{
            elegir: setPasoAct,
            copiar: () => copiar(dir),
            recargar: () => window.location.reload(),
            esPrimeraVez: () => {
              setModo("instalar");
              setVolvioAtras(true);
              ir("descargar");
            },
          }}
        />
      ) : (
        <Asistente
          paso={paso}
          estado={estado}
          conexion={conexion}
          navegador={entorno.navegador}
          sistema={sistema}
          demo={demo}
          version={version}
          copiada={copiado}
          manual={demo ? <p className="suave">En la demo no se pide código.</p> : <ConectarExtension />}
          acciones={{
            elegir: (q) => {
              setVolvioAtras(true);
              ir(q);
            },
            siguiente: () => ir(siguiente(paso)),
            atras: () => {
              setVolvioAtras(true);
              ir(anterior(paso));
            },
            descargar: () => {
              // Se deja empezar la descarga antes de cambiar de paso.
              setTimeout(() => ir("descomprimir"), 700);
            },
            elegirSistema: setSistema,
            copiar: () => copiar(dir),
            conectar: () => void conectar(),
            recargar: () => window.location.reload(),
            empezarDeNuevo: () => {
              setVolvioAtras(true);
              ir("descargar");
            },
            actualizar: () => {
              setModo("actualizar");
              setPasoAct("descargar");
            },
          }}
        />
      )}
    </div>
  );
}
