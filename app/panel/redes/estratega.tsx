"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { almacenLocal, leerAlmacen } from "@/lib/panel/almacen";
import { MAX_FOTOS_ANALISIS, resumirFotos, type FotoParaAnalisis } from "@/lib/redes/analisis-fotos";
import {
  MAX_DIAS,
  MAX_POST,
  calcularPauta,
  pasosAdsManager,
  pasosInstagram,
  presupuestoSugerido,
  usd,
  type CasaEstratega,
  type ResultadoPost,
} from "@/lib/redes/estratega";
import {
  claveEstratega,
  estrategiaGuardada,
  fotosGuardadas,
  pautaGuardada,
  type EstrategiaGuardada,
  type FotosGuardadas,
  type PautaGuardada,
  type TipoGuardado,
} from "@/lib/redes/guardado-estratega";
import { analizarFotos, armarEstrategia, mejorarPost, pdfEstrategia, recomendarPauta } from "./acciones";
import { AvisoDemo, DocumentoEstrategia, Pasos, ResultadoCalculo, ResultadoDelPost, ResultadoFotos, ResultadoPauta } from "./vistas";

// Redes sociales: la estratega comercial del corredor en cuatro pestañas. Lo que arma se guarda en este navegador
// (por casa) para volver a verlo; nada se publica ni se paga desde aquí.

export type PestanaEstratega = "post" | "pautas" | "estrategia" | "fotos";
export const PESTANAS_ESTRATEGA: { id: PestanaEstratega; nombre: string; corto: string }[] = [
  { id: "post", nombre: "Mejorar un post", corto: "Post" },
  { id: "pautas", nombre: "Pautas", corto: "Pautas" },
  { id: "estrategia", nombre: "Estrategia por casa", corto: "Estrategia" },
  { id: "fotos", nombre: "Analizar fotos", corto: "Fotos" },
];

export interface CasaRedes extends CasaEstratega {
  etiqueta: string;
  precioTexto: string | null;
  pausada: boolean;
  fotos: FotoParaAnalisis[];
}

export interface DatosEstratega {
  corredorId: string;
  asistente: string;
  casas: CasaRedes[];
  casaInicial: string | null;
  pestana: PestanaEstratega;
}

type Aviso = { texto: string; error: boolean } | null;

function recordarEnDireccion(valores: Record<string, string>) {
  try {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(valores)) {
      if (v) u.searchParams.set(k, v);
      else u.searchParams.delete(k);
    }
    window.history.replaceState(window.history.state, "", u);
  } catch {
    /* sin historial: no pasa nada */
  }
}

function guardar(corredorId: string, casaId: string, tipo: TipoGuardado, valor: unknown) {
  try {
    almacenLocal()?.setItem(claveEstratega(corredorId, casaId, tipo), JSON.stringify(valor));
  } catch {
    /* sin almacén (modo privado o lleno): se ve igual, solo no se recuerda */
  }
}

const SIN_RED = "No se pudo conectar. Revisa el internet e inténtalo de nuevo.";
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export function Estratega(d: DatosEstratega) {
  const [pestana, setPestana] = useState<PestanaEstratega>(d.pestana);
  const [casaId, setCasaId] = useState<string>(() => (d.casas.some((c) => c.id === d.casaInicial) ? d.casaInicial! : ""));
  const casa = d.casas.find((c) => c.id === casaId) ?? null;
  const elegirPestana = (p: PestanaEstratega) => {
    setPestana(p);
    recordarEnDireccion({ ver: p });
  };
  const elegirCasa = (id: string) => {
    setCasaId(id);
    recordarEnDireccion({ casa: id });
  };

  return (
    <div className="est">
      <div className="est-pestanas" role="tablist" aria-label="Qué quieres hacer">
        {PESTANAS_ESTRATEGA.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`est-tab-${p.id}`}
            aria-selected={pestana === p.id}
            aria-controls={`est-panel-${p.id}`}
            data-patty={`estratega-pestana-${p.id}`}
            onClick={() => elegirPestana(p.id)}
          >
            <span className="est-tab-largo">{p.nombre}</span>
            <span className="est-tab-corto" aria-hidden>
              {p.corto}
            </span>
          </button>
        ))}
      </div>

      <label className="est-casa">
        <span>{pestana === "post" ? "¿De qué casa es? (opcional)" : "¿Para qué casa?"}</span>
        <select value={casaId} onChange={(e) => elegirCasa(e.target.value)} data-patty="estratega-casa">
          <option value="">{pestana === "post" ? "Ninguna: solo mi texto" : "Elige una casa"}</option>
          {d.casas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} · {c.titulo}
              {c.pausada ? " (pausada)" : ""}
            </option>
          ))}
        </select>
        {casa && (
          <span className="suave est-casa-datos">
            {casa.etiqueta}
            {casa.precioTexto ? ` · ${casa.precioTexto}` : ""}
          </span>
        )}
      </label>

      <div role="tabpanel" id={`est-panel-${pestana}`} aria-labelledby={`est-tab-${pestana}`}>
        {pestana === "post" && <PestanaPost key={`post-${casaId}`} casaId={casaId} corredorId={d.corredorId} />}
        {pestana !== "post" && !casa && <ElegirCasa hay={d.casas.length > 0} />}
        {pestana === "pautas" && casa && <PestanaPautas key={`pauta-${casa.id}`} casa={casa} corredorId={d.corredorId} />}
        {pestana === "estrategia" && casa && <PestanaEstrategia key={`est-${casa.id}`} casa={casa} corredorId={d.corredorId} asistente={d.asistente} />}
        {pestana === "fotos" && casa && <PestanaFotos key={`fotos-${casa.id}`} casa={casa} corredorId={d.corredorId} />}
      </div>
    </div>
  );
}

function ElegirCasa({ hay }: { hay: boolean }) {
  return (
    <div className="tarjeta est-vacio">
      {hay ? <p>Elige arriba una de tus casas para empezar.</p> : <p>Todavía no tienes casas a la venta. Agrega una en Mis casas y vuelve aquí.</p>}
    </div>
  );
}

function Estado({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p className={aviso.error ? "aviso error" : "aviso"} role="status">
      {aviso.texto}
    </p>
  );
}

// ---------------------------------------------------------------- Post

function PestanaPost({ casaId, corredorId }: { casaId: string; corredorId: string }) {
  const clave = `redes-estratega:${corredorId}:post`;
  const [caption, setCaption] = useState("");
  const [resultado, setResultado] = useState<ResultadoPost | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [demo, setDemo] = useState<string | null>(null);
  const [trabajando, empezar] = useTransition();

  // Lo escrito se conserva en esta pestaña del navegador (por si se recarga).
  useEffect(() => {
    try {
      const g = window.sessionStorage.getItem(clave);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage solo existe en el navegador: se lee ya montado.
      if (g && g.length <= MAX_POST) setCaption(g);
    } catch {
      /* sin almacén */
    }
  }, [clave]);
  const escribir = (t: string) => {
    setCaption(t);
    try {
      window.sessionStorage.setItem(clave, t);
    } catch {
      /* sin almacén */
    }
  };

  const pedir = () =>
    empezar(async () => {
      setAviso(null);
      try {
        const r = await mejorarPost(casaId || null, caption);
        if (!r.ok) setAviso({ texto: r.motivo, error: true });
        else {
          setResultado(r.post);
          setDemo(r.demo ? r.aviso : null);
          if (!r.demo && r.aviso) setAviso({ texto: r.aviso, error: false });
        }
      } catch {
        setAviso({ texto: SIN_RED, error: true });
      }
    });

  return (
    <div className="est-cuerpo">
      <section className="tarjeta pila">
        <h2>Pega tu publicación</h2>
        <p className="suave">
          Te digo qué funciona, qué le falta y te doy versiones listas en tu tono. Si eliges la casa, uso sus datos; nunca invento cifras.
        </p>
        <textarea
          value={caption}
          onChange={(e) => escribir(e.target.value)}
          rows={8}
          maxLength={MAX_POST}
          placeholder="Ejemplo: Hermosa casa en Escazú con piscina, 4 habitaciones… ¡Escríbeme!"
          aria-label="Texto de tu publicación"
          data-patty="estratega-post-texto"
        />
        <div className="est-fila">
          <span className="suave est-contador">
            {caption.length.toLocaleString("es-CR")} / {MAX_POST.toLocaleString("es-CR")}
          </span>
          <button type="button" className="primario" onClick={pedir} disabled={trabajando || !caption.trim()} data-patty="estratega-post-mejorar">
            {trabajando ? "Revisando…" : "Mejorar mi post"}
          </button>
        </div>
        <Estado aviso={aviso} />
      </section>
      <AvisoDemo texto={demo} />
      {resultado && <ResultadoDelPost post={resultado} />}
    </div>
  );
}

// ---------------------------------------------------------------- Pautas

function PestanaPautas({ casa, corredorId }: { casa: CasaRedes; corredorId: string }) {
  const sugerido = useMemo(() => presupuestoSugerido(casa), [casa]);
  const [diario, setDiario] = useState(String(sugerido.diarioUsd));
  const [dias, setDias] = useState(String(sugerido.dias));
  const [guardada, setGuardada] = useState<PautaGuardada | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [trabajando, empezar] = useTransition();

  useEffect(() => {
    const g = leerAlmacen(almacenLocal(), claveEstratega(corredorId, casa.id, "pauta"), pautaGuardada);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador: se lee ya montado.
    if (g) setGuardada(g);
  }, [corredorId, casa.id]);

  const calculo = calcularPauta(diario, Number(dias));
  const presupuesto = calculo.ok ? { diario: calculo.diario, dias: calculo.dias } : { diario: sugerido.diarioUsd, dias: sugerido.dias };
  const pauta = guardada?.pauta ?? null;

  const pedir = () =>
    empezar(async () => {
      setAviso(null);
      try {
        const r = await recomendarPauta(casa.id);
        if (!r.ok) setAviso({ texto: r.motivo, error: true });
        else {
          const g: PautaGuardada = { fecha: new Date().toISOString(), pauta: r.pauta, demo: r.demo };
          setGuardada(g);
          guardar(corredorId, casa.id, "pauta", g);
          if (r.aviso && !r.demo) setAviso({ texto: r.aviso, error: false });
        }
      } catch {
        setAviso({ texto: SIN_RED, error: true });
      }
    });

  return (
    <div className="est-cuerpo est-dos">
      <div className="est-columna">
        <section className="tarjeta pila" data-patty="estratega-calculadora">
          <h2>Calculadora</h2>
          <p className="suave">
            Sugerido para esta casa: <strong>{usd(sugerido.diarioUsd)}</strong> al día por <strong>{sugerido.dias} días</strong>. {sugerido.porque}
          </p>
          <div className="est-entradas">
            <label>
              <span>Por día (USD)</span>
              <input inputMode="decimal" value={diario} onChange={(e) => setDiario(e.target.value)} aria-label="Presupuesto por día en dólares" />
            </label>
            <label>
              <span>Días</span>
              <input type="number" min={1} max={MAX_DIAS} value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Cantidad de días" />
            </label>
          </div>
          {(diario !== String(sugerido.diarioUsd) || dias !== String(sugerido.dias)) && (
            <button
              type="button"
              className="enlace"
              onClick={() => {
                setDiario(String(sugerido.diarioUsd));
                setDias(String(sugerido.dias));
              }}
            >
              Volver a lo sugerido
            </button>
          )}
          <ResultadoCalculo calculo={calculo} />
          <p className="suave est-nota">Desde aquí no se paga nada: tú la lanzas y la pagas en Instagram o en Meta.</p>
        </section>
        <Pasos titulo="Lanzarla desde Instagram (Promocionar)" pasos={pasosInstagram(pauta, casa, presupuesto)} abierto />
        <Pasos titulo="Lanzarla desde el Administrador de anuncios" pasos={pasosAdsManager(pauta, casa, presupuesto)} />
      </div>
      <div className="est-columna">
        <section className="tarjeta pila">
          <h2>Público y anuncio</h2>
          <p className="suave">A quién mostrársela, dónde y con qué foto o video, según los datos de la casa.</p>
          <button type="button" className="primario" onClick={pedir} disabled={trabajando} data-patty="estratega-pauta-pedir">
            {trabajando ? "Pensando la pauta…" : pauta ? "Volver a recomendar" : "Recomendar la pauta"}
          </button>
          {guardada && <p className="suave est-nota">Recomendada el {fechaCorta(guardada.fecha)} (guardada en este navegador).</p>}
          <Estado aviso={aviso} />
        </section>
        <AvisoDemo texto={guardada?.demo ? "Demostración: la pauta la arma el código con los datos de la casa, sin IA de verdad." : null} />
        {pauta && <ResultadoPauta pauta={pauta} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Estrategia

function PestanaEstrategia({ casa, corredorId, asistente }: { casa: CasaRedes; corredorId: string; asistente: string }) {
  const [guardada, setGuardada] = useState<EstrategiaGuardada | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pdf, setPdf] = useState<{ url: string; nombre: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [trabajando, empezar] = useTransition();
  const [armandoPdf, empezarPdf] = useTransition();

  useEffect(() => {
    const g = leerAlmacen(almacenLocal(), claveEstratega(corredorId, casa.id, "estrategia"), estrategiaGuardada);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador: se lee ya montado.
    if (g) setGuardada(g);
  }, [corredorId, casa.id]);
  useEffect(() => () => (pdf ? URL.revokeObjectURL(pdf.url) : undefined), [pdf]);

  const pedir = () =>
    empezar(async () => {
      setAviso(null);
      setPdf(null);
      try {
        const r = await armarEstrategia(casa.id);
        if (!r.ok) setAviso({ texto: r.motivo, error: true });
        else {
          const g: EstrategiaGuardada = { fecha: new Date().toISOString(), markdown: r.markdown, demo: r.demo };
          setGuardada(g);
          guardar(corredorId, casa.id, "estrategia", g);
          if (r.aviso && !r.demo) setAviso({ texto: r.aviso, error: false });
        }
      } catch {
        setAviso({ texto: SIN_RED, error: true });
      }
    });

  const hacerPdf = () =>
    guardada &&
    empezarPdf(async () => {
      setAviso(null);
      try {
        const r = await pdfEstrategia(casa.id, guardada.markdown);
        if (!r.ok) setAviso({ texto: r.motivo, error: true });
        else {
          const bytes = Uint8Array.from(atob(r.datos), (c) => c.charCodeAt(0));
          setPdf({ url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), nombre: r.nombre });
        }
      } catch {
        setAviso({ texto: SIN_RED, error: true });
      }
    });

  const copiar = async () => {
    if (!guardada) return;
    try {
      await navigator.clipboard.writeText(guardada.markdown);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sin permiso: el texto queda a la vista */
    }
  };

  return (
    <div className="est-cuerpo">
      <section className="tarjeta pila">
        <h2>Estrategia de {casa.titulo}</h2>
        <p className="suave">
          {asistente} arma el posicionamiento, el comprador ideal, un calendario de 2 semanas, el plan pagado y el orgánico, y qué medir. Usa solo los datos
          de la ficha; lo que falte te lo marca para confirmar.
        </p>
        <div className="est-botones">
          <button type="button" className="primario" onClick={pedir} disabled={trabajando} data-patty="estratega-armar">
            {trabajando ? "Armando la estrategia…" : guardada ? "Volver a armarla" : "Armar la estrategia"}
          </button>
          {guardada && (
            <>
              <button type="button" className="boton" onClick={hacerPdf} disabled={armandoPdf} data-patty="estratega-pdf">
                {armandoPdf ? "Armando el PDF…" : "Hacer PDF"}
              </button>
              <button type="button" className="boton" onClick={copiar}>
                {copiado ? "¡Copiada!" : "Copiar"}
              </button>
            </>
          )}
        </div>
        {pdf && (
          <p className="est-pdf">
            <a href={pdf.url} target="_blank" rel="noopener" className="boton chico">
              Abrir el PDF
            </a>
            <a href={pdf.url} download={pdf.nombre} className="boton chico">
              Descargar
            </a>
          </p>
        )}
        {guardada && <p className="suave est-nota">Armada el {fechaCorta(guardada.fecha)} (guardada en este navegador).</p>}
        <Estado aviso={aviso} />
      </section>
      {guardada && <DocumentoEstrategia markdown={guardada.markdown} />}
    </div>
  );
}

// ---------------------------------------------------------------- Fotos

function PestanaFotos({ casa, corredorId }: { casa: CasaRedes; corredorId: string }) {
  const [guardadas, setGuardadas] = useState<FotosGuardadas | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [trabajando, empezar] = useTransition();

  useEffect(() => {
    const g = leerAlmacen(almacenLocal(), claveEstratega(corredorId, casa.id, "fotos"), (v) => fotosGuardadas(v, casa.fotos));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador: se lee ya montado.
    if (g) setGuardadas(g);
  }, [corredorId, casa.id, casa.fotos]);

  const resumen = useMemo(() => (guardadas ? resumirFotos(guardadas.analisis, casa.tipo) : null), [guardadas, casa.tipo]);
  const cuantas = Math.min(casa.fotos.length, MAX_FOTOS_ANALISIS);

  const pedir = () =>
    empezar(async () => {
      setAviso(null);
      try {
        const r = await analizarFotos(casa.id);
        if (!r.ok) setAviso({ texto: r.motivo, error: true });
        else {
          const g: FotosGuardadas = { fecha: new Date().toISOString(), analisis: r.analisis, comentario: r.comentario, demo: r.demo };
          setGuardadas(g);
          guardar(corredorId, casa.id, "fotos", g);
          if (r.aviso && !r.demo) setAviso({ texto: r.aviso, error: false });
        }
      } catch {
        setAviso({ texto: SIN_RED, error: true });
      }
    });

  return (
    <div className="est-cuerpo">
      <section className="tarjeta pila">
        <h2>Las fotos de {casa.titulo}</h2>
        {casa.fotos.length === 0 ? (
          <p>Esta casa todavía no tiene fotos. Súbelas desde la ficha de la casa y vuelve aquí.</p>
        ) : (
          <>
            <p className="suave">
              Califico cada foto (luz, encuadre, orden y nitidez), elijo la portada para el feed y para historias, te digo cuáles mejorar y qué espacios faltan, y
              el orden del carrusel.
              {casa.fotos.length > MAX_FOTOS_ANALISIS ? ` Se analizan las primeras ${MAX_FOTOS_ANALISIS} de ${casa.fotos.length}.` : ""}
            </p>
            <button type="button" className="primario" onClick={pedir} disabled={trabajando} data-patty="estratega-analizar">
              {trabajando ? "Mirando las fotos…" : guardadas ? `Volver a analizar (${cuantas})` : `Analizar ${cuantas === 1 ? "la foto" : `las ${cuantas} fotos`}`}
            </button>
          </>
        )}
        {guardadas && <p className="suave est-nota">Analizadas el {fechaCorta(guardadas.fecha)} (guardado en este navegador).</p>}
        <Estado aviso={aviso} />
      </section>
      <AvisoDemo texto={guardadas?.demo ? "Demostración: las notas son de ejemplo, sin IA de verdad." : null} />
      {resumen && guardadas && <ResultadoFotos resumen={resumen} casaId={casa.id} comentario={guardadas.comentario} />}
    </div>
  );
}
