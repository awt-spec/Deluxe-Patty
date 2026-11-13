"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { esCostosa, type OperacionImagen, type TurnoChat } from "@/lib/redes/chat";
import type { OpcionFoto } from "@/lib/redes/fotos";
import { MODOS_TEXTO, type ModoTexto } from "@/lib/redes/texto-ia";
import { TAMANOS, type Formato } from "@/lib/redes/texto";
import type { DatosVideo } from "@/lib/redes/video";
import { editarFotoRedes, mejorarFotoRedes, mejorarTextoRedes, pedirImagenRedes, pedirTextoRedes } from "./acciones";
import { ChatRedes, type RespuestaChat } from "./chat";
import { CopiarTexto } from "./copiar";
import type { Colores } from "./dibujo";
import { EditorVideo } from "./video";

// Estudio de redes de una casa, en tres pestañas: Imagen (post e historia con la foto elegida), Video
// (montado en el teléfono con las fotos reales) y Texto (editable, con botones de IA).

export type Pestana = "imagen" | "video" | "texto";

export interface DatosEstudio {
  propiedadId: string;
  codigo: string;
  opciones: OpcionFoto[];
  elegidaInicial: string | null;
  texto: string;
  datosVideo: DatosVideo;
  colores: Colores;
  fondoLogo: string;
  logo: string | null;
  /** Si el corredor tiene marca propia (si no, el video usa colores neutros y el estilo Moderno). */
  conMarca: boolean;
  /** null si se puede mejorar fotos con IA; si no, por qué. */
  sinMejorar: string | null;
  pestana: Pestana;
  /** Nombre de la asistente (corredores.nombre_asistente). */
  asistente: string;
}

const PESTANAS: { id: Pestana; nombre: string }[] = [
  { id: "imagen", nombre: "Imagen" },
  { id: "video", nombre: "Video" },
  { id: "texto", nombre: "Texto" },
];

function recordarEnDireccion(clave: string, valor: string) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set(clave, valor);
    window.history.replaceState(window.history.state, "", u);
  } catch {
    /* sin historial: no pasa nada */
  }
}

export function Estudio(d: DatosEstudio) {
  const [pestana, setPestana] = useState<Pestana>(d.pestana);
  const [texto, setTexto] = useState(d.texto);
  const elegir = (p: Pestana) => {
    setPestana(p);
    recordarEnDireccion("ver", p);
  };
  return (
    <div className="redes-estudio">
      <div className="redes-pestanas" role="tablist" aria-label="Qué quieres hacer">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`redes-tab-${p.id}`}
            aria-selected={pestana === p.id}
            aria-controls={`redes-panel-${p.id}`}
            data-patty={`redes-pestana-${p.id}`}
            onClick={() => elegir(p.id)}
          >
            {p.nombre}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`redes-panel-${pestana}`} aria-labelledby={`redes-tab-${pestana}`}>
        {pestana === "imagen" && <PestanaImagen {...d} />}
        {pestana === "video" && <EditorVideo {...d} />}
        {pestana === "texto" && <PestanaTexto propiedadId={d.propiedadId} asistente={d.asistente} original={d.texto} texto={texto} setTexto={setTexto} />}
      </div>
    </div>
  );
}

// --- Imagen ----------------------------------------------------------------------------------------

function PestanaImagen(d: DatosEstudio) {
  const router = useRouter();
  const [url, setUrl] = useState(() => (d.opciones.some((o) => o.url === d.elegidaInicial) ? d.elegidaInicial! : d.opciones[0]?.url));
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const [mejorando, empezar] = useTransition();
  const [antes, setAntes] = useState<string[]>([]);
  const elegida = d.opciones.find((o) => o.url === url) ?? d.opciones[0];
  if (!elegida) return null;
  const mejoradaDeEsta = d.opciones.find((o) => o.tipo === "mejorada" && o.original === elegida.original);
  const enlace = (formato: Formato, descargar = false) =>
    `/panel/propiedades/${d.propiedadId}/redes/imagen?formato=${formato}&img=${encodeURIComponent(elegida.url)}${descargar ? "&descargar=1" : ""}`;

  const elegir = (u: string) => {
    setUrl(u);
    setAviso(null);
    recordarEnDireccion("img", u);
  };
  // Lo que hace el chat se puede deshacer: vuelve a la foto que estaba elegida.
  const elegirDesdeChat = (u: string) => {
    if (u === url) return;
    setAntes((a) => [...a, url].slice(-20));
    elegir(u);
  };
  const deshacer = () => {
    const previa = antes[antes.length - 1];
    if (!previa) return;
    setAntes(antes.slice(0, -1));
    elegir(previa);
  };

  /** Lo que gasta en IA de imágenes se pregunta antes; después se elige la imagen nueva. */
  const confirmacion = (o: OperacionImagen): RespuestaChat["confirmar"] => {
    const foto = o.nombre.toLowerCase();
    const detalle =
      o.op === "quitar_objetos"
        ? `Quitar «${o.que}» de la ${foto}. Sale como imagen ilustrativa (lo dice la imagen) y la original no se toca.`
        : o.op === "amueblar"
          ? `Poner muebles estilo ${o.estilo === "clasico" ? "clásico" : o.estilo}${o.cuarto ? ` en ${o.cuarto}` : ""} en la ${foto}. Sale como imagen ilustrativa y la original no se toca.`
          : `Mejorar la luz y el color de la ${foto}, sin cambiar nada. La original queda guardada.`;
    return {
      pregunta: "Esto usa IA de imágenes. ¿Hacerlo?",
      detalle,
      hacer: async () => {
        const r =
          o.op === "quitar_objetos"
            ? await editarFotoRedes(d.propiedadId, o.url, { tipo: o.op, que: o.que })
            : o.op === "amueblar"
              ? await editarFotoRedes(d.propiedadId, o.url, { tipo: o.op, estilo: o.estilo, cuarto: o.cuarto })
              : await mejorarFotoRedes(d.propiedadId, o.url);
        if (!r.ok) return { texto: r.motivo, error: true };
        router.refresh();
        elegirDesdeChat(r.url);
        return {
          texto:
            o.op === "mejorar_foto"
              ? "Listo, la mejoré y ya la puse. Revísala: la IA a veces cambia detalles."
              : "Listo, ya la puse. Revísala bien: es ilustrativa y en el post y la historia dice «Imagen ilustrativa».",
        };
      },
    };
  };
  const pedirAlChat = async (pedido: string, historial: TurnoChat[]): Promise<RespuestaChat> => {
    const r = await pedirImagenRedes(d.propiedadId, elegida.url, pedido, historial);
    if (!r.ok) return { texto: r.motivo, error: true };
    const cambios: string[] = [];
    for (const o of r.ops) {
      if (o.op === "elegir_foto") {
        elegirDesdeChat(o.url);
        cambios.push(`elegí la ${o.nombre.toLowerCase()}`);
      }
    }
    const costosa = r.ops.find(esCostosa);
    return {
      texto: r.bloqueo ? `${r.respuesta} ${r.bloqueo}` : r.respuesta,
      cambios,
      ...(costosa ? { confirmar: confirmacion(costosa) } : {}),
    };
  };
  const mejorar = () =>
    empezar(async () => {
      setAviso(null);
      const r = await mejorarFotoRedes(d.propiedadId, elegida.url);
      if (!r.ok) return setAviso({ texto: r.motivo, error: true });
      router.refresh();
      elegir(r.url);
      setAviso({ texto: "Listo, la mejoré. Revísala antes de publicarla: la IA a veces cambia detalles. La original sigue guardada.", error: false });
    });

  return (
    <div className="redes-con-chat">
    <div className="pila">
      <p className="suave">Toca la foto que quieres usar. El precio y los datos salen de la ficha de la casa.</p>
      <TiraFotos opciones={d.opciones} elegida={elegida.url} alElegir={elegir} />
      {elegida.ilustrativa && (
        <p className="aviso">Esta foto está hecha con IA: la imagen dice “Imagen ilustrativa” para que nadie la tome como real.</p>
      )}
      {!elegida.ilustrativa && (
        <div className="redes-mejorar">
          {elegida.tipo === "mejorada" ? (
            <p className="suave">Esta es la versión mejorada con IA. Revísala: si algo no se ve igual a la casa, usa la original.</p>
          ) : mejoradaDeEsta ? (
            <p className="suave">
              Esta foto ya tiene versión mejorada.{" "}
              <button type="button" className="enlace" onClick={() => elegir(mejoradaDeEsta.url)}>
                Usar la mejorada
              </button>
            </p>
          ) : d.sinMejorar ? (
            <p className="suave">{d.sinMejorar}</p>
          ) : (
            <button type="button" className="boton grande" onClick={mejorar} disabled={mejorando} data-patty="redes-mejorar-foto">
              {mejorando ? "Mejorando la foto… (tarda un minuto)" : "Mejorar esta foto con IA"}
            </button>
          )}
        </div>
      )}
      {aviso && (
        <p className={aviso.error ? "aviso error" : "aviso"} role="status">
          {aviso.texto}
        </p>
      )}
      <div className="redes-vistas">
        {(Object.keys(TAMANOS) as Formato[]).map((f) => (
          <figure key={f} className={`redes-vista ${f}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enlace(f)} alt={TAMANOS[f].nombre} />
            <figcaption>
              <span>{TAMANOS[f].nombre}</span>
              <a href={enlace(f, true)} className="boton primario chico" download data-patty={`redes-descargar-${f}`}>
                Descargar
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
      <ChatRedes
        clave={d.propiedadId}
        asistente={d.asistente}
        pestana="imagen"
        sugerencias={["Usa la foto de la piscina", "Quita el carro", "Amuebla la sala estilo moderno", "Mejora esta foto"]}
        ayuda="Dime qué foto usar («la de la piscina») o qué hacerle. Con IA solo quito cosas sueltas (carros, basureros, personas) o pongo muebles: nunca cambio la casa ni tapo daños. Antes de gastar te pregunto."
        pedir={pedirAlChat}
        puedeDeshacer={antes.length > 0}
        deshacer={deshacer}
      />
    </div>
  );
}

/** Miniaturas de todas las fotos de la casa (originales, mejoradas e ilustrativas). */
export function TiraFotos({ opciones, elegida, alElegir, marcadas }: { opciones: OpcionFoto[]; elegida?: string; alElegir: (url: string) => void; marcadas?: Set<string> }) {
  return (
    <div className="redes-fotos redes-tira" role="group" aria-label="Fotos de la casa" data-patty="redes-fotos">
      {opciones.map((o) => (
        <button
          key={o.url}
          type="button"
          onClick={() => alElegir(o.url)}
          className={o.url === elegida || marcadas?.has(o.url) ? "elegida" : undefined}
          aria-pressed={o.url === elegida || marcadas?.has(o.url) ? "true" : "false"}
          title={o.nombre}
          aria-label={o.nombre}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={o.url} alt="" loading="lazy" />
          {o.ilustrativa ? <span>Ilustrativa</span> : o.tipo === "mejorada" ? <span>Mejorada</span> : null}
        </button>
      ))}
    </div>
  );
}

// --- Texto -----------------------------------------------------------------------------------------

function PestanaTexto({
  propiedadId,
  asistente,
  original,
  texto,
  setTexto,
}: {
  propiedadId: string;
  asistente: string;
  original: string;
  texto: string;
  setTexto: (t: string) => void;
}) {
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const [antes, setAntes] = useState<string[]>([]);
  const pedirAlChat = async (pedido: string, historial: TurnoChat[]): Promise<RespuestaChat> => {
    const r = await pedirTextoRedes(propiedadId, texto, pedido, historial);
    if (!r.ok) return { texto: r.motivo, error: true };
    setAntes((a) => [...a, texto].slice(-20));
    setTexto(r.texto);
    setAviso(null);
    return { texto: `${r.respuesta} Léelo antes de publicarlo.` };
  };
  const [trabajando, setTrabajando] = useState<ModoTexto | null>(null);
  const [, empezar] = useTransition();
  const pedir = (modo: ModoTexto) =>
    empezar(async () => {
      setTrabajando(modo);
      setAviso(null);
      try {
        const r = await mejorarTextoRedes(propiedadId, texto, modo);
        if (!r.ok) setAviso({ texto: r.motivo, error: true });
        else {
          setTexto(r.texto);
          setAviso({ texto: r.aviso ?? "Listo. Léelo antes de publicarlo; puedes cambiar lo que quieras.", error: false });
        }
      } catch {
        setAviso({ texto: "No se pudo conectar. Revisa el internet e inténtalo de nuevo.", error: true });
      } finally {
        setTrabajando(null);
      }
    });

  return (
    <div className="redes-con-chat">
    <section className="tarjeta pila">
      <h2>Texto para acompañarla</h2>
      <p className="suave">Puedes cambiarlo a tu gusto. La IA usa solo los datos de la ficha: si pone un número que no está ahí, no se usa.</p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={12}
        maxLength={2200}
        aria-label="Texto para la publicación"
        data-patty="redes-texto"
      />
      <div className="redes-botones-ia" data-patty="redes-texto-ia">
        {(Object.keys(MODOS_TEXTO) as ModoTexto[]).map((m) => (
          <button key={m} type="button" className="boton" onClick={() => pedir(m)} disabled={trabajando !== null}>
            {trabajando === m ? "Escribiendo…" : MODOS_TEXTO[m].boton}
          </button>
        ))}
        <button
          type="button"
          className="boton"
          disabled={trabajando !== null || texto === original}
          onClick={() => {
            setTexto(original);
            setAviso(null);
          }}
        >
          Volver al original
        </button>
      </div>
      {aviso && (
        <p className={aviso.error ? "aviso error" : "aviso"} role="status">
          {aviso.texto}
        </p>
      )}
      <CopiarTexto texto={texto} />
    </section>
      <ChatRedes
        clave={propiedadId}
        asistente={asistente}
        pestana="texto"
        sugerencias={["Hazlo más corto", "Resalta la piscina", "Ponlo en inglés", "Agrégale que acepta mascotas"]}
        ayuda="Dime cómo lo quieres («más corto», «quita lo del jardín»). Solo uso lo que dice la ficha y lo que tú me digas; el precio, el código y tu contacto se quedan."
        pedir={pedirAlChat}
        puedeDeshacer={antes.length > 0}
        deshacer={() => {
          const previo = antes[antes.length - 1];
          if (previo === undefined) return;
          setAntes(antes.slice(0, -1));
          setTexto(previo);
        }}
      />
    </div>
  );
}
