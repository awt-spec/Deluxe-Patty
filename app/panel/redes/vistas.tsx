import Link from "next/link";
import { Contenido } from "../patty-contenido";
import { CopiarTexto } from "../propiedades/[id]/redes/copiar";
import { NOMBRE_ESPACIO, type FotoAnalizada, type ResumenFotos } from "@/lib/redes/analisis-fotos";
import { OBJETIVOS, UBICACIONES, usd, type Calculo, type Pauta, type ResultadoPost } from "@/lib/redes/estratega";

// Cómo se ven los resultados de Redes sociales. Solo forma: los datos ya vienen revisados del servidor o del código.

export function AvisoDemo({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="aviso est-aviso" role="status">
      {texto}
    </p>
  );
}

export function ResultadoDelPost({ post }: { post: ResultadoPost }) {
  return (
    <div className="est-resultado" data-patty="estratega-post-resultado">
      <section className="tarjeta est-critica">
        {post.fuerte.length > 0 && (
          <div>
            <h3>Lo que ya funciona</h3>
            <ul className="est-lista est-bien">
              {post.fuerte.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
        {post.mejorar.length > 0 && (
          <div>
            <h3>Lo que le falta</h3>
            <ul className="est-lista est-falta">
              {post.mejorar.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <div className="est-versiones">
        {post.versiones.map((v, i) => (
          <article key={i} className="tarjeta est-version">
            <header>
              <span className="est-numero">{i + 1}</span>
              <h3>{v.nombre}</h3>
            </header>
            <p className="est-texto">{v.texto}</p>
            <CopiarTexto texto={v.texto} />
          </article>
        ))}
      </div>
      <p className="suave est-nota">Léelas antes de publicar. Los datos salen de la ficha y de tu texto; el enlace a tu WhatsApp lo pone el sistema.</p>
    </div>
  );
}

const miles = (n: number) => n.toLocaleString("es-CR");

/** Resultado de la calculadora: total en grande y los rangos como estimación. */
export function ResultadoCalculo({ calculo }: { calculo: Calculo }) {
  if (!calculo.ok) {
    return (
      <p className="aviso error" role="status">
        {calculo.motivo}
      </p>
    );
  }
  return (
    <div className="est-calculo" aria-live="polite">
      <div className="est-total">
        <span className="suave">Total de la campaña</span>
        <strong>{usd(calculo.total)}</strong>
        <span className="suave">
          {usd(calculo.diario)} × {calculo.dias} {calculo.dias === 1 ? "día" : "días"}
        </span>
      </div>
      <dl className="est-rangos">
        <div>
          <dt>Personas alcanzadas</dt>
          <dd>
            {miles(calculo.alcance[0])} a {miles(calculo.alcance[1])}
          </dd>
        </div>
        <div>
          <dt>Veces que se ve</dt>
          <dd>
            {miles(calculo.impresiones[0])} a {miles(calculo.impresiones[1])}
          </dd>
        </div>
        <div>
          <dt>Mensajes a WhatsApp</dt>
          <dd>
            {miles(calculo.mensajes[0])} a {miles(calculo.mensajes[1])}
          </dd>
        </div>
      </dl>
      <p className="suave est-nota">
        Estimaciones de referencia para bienes raíces en Costa Rica, no una promesa: Meta te muestra su propio cálculo antes de pagar.
      </p>
    </div>
  );
}

function Chips({ lista }: { lista: string[] }) {
  if (!lista.length) return <span className="suave">—</span>;
  return (
    <ul className="est-chips">
      {lista.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

export function ResultadoPauta({ pauta }: { pauta: Pauta }) {
  const anuncio = [pauta.titular, pauta.textoAnuncio].filter(Boolean).join("\n\n");
  return (
    <div className="est-resultado" data-patty="estratega-pauta-resultado">
      <section className="tarjeta pila">
        <p className="est-etiqueta">Objetivo</p>
        <h3 className="est-grande">{OBJETIVOS[pauta.objetivo].nombre}</h3>
        {pauta.porque && <p>{pauta.porque}</p>}
      </section>
      <section className="tarjeta pila">
        <h3>Público</h3>
        <dl className="est-publico">
          <div>
            <dt>Zonas</dt>
            <dd>
              <Chips lista={pauta.publico.zonas} />
              {pauta.publico.radioKm && <span className="suave"> Radio de {pauta.publico.radioKm} km alrededor de la casa.</span>}
            </dd>
          </div>
          {pauta.publico.paises.length > 0 && (
            <div>
              <dt>Países</dt>
              <dd>
                <Chips lista={pauta.publico.paises} />
              </dd>
            </div>
          )}
          <div>
            <dt>Edad</dt>
            <dd>
              {pauta.publico.edadMin} a {pauta.publico.edadMax} años
            </dd>
          </div>
          <div>
            <dt>Intereses</dt>
            <dd>
              <Chips lista={pauta.publico.intereses} />
            </dd>
          </div>
        </dl>
      </section>
      <section className="tarjeta pila">
        <h3>Dónde sale</h3>
        <Chips lista={pauta.ubicaciones.map((u) => UBICACIONES[u])} />
        {pauta.creativo && (
          <>
            <h3>Qué usar</h3>
            <p>{pauta.creativo}</p>
          </>
        )}
      </section>
      {anuncio && (
        <section className="tarjeta pila">
          <h3>Texto del anuncio</h3>
          <p className="est-texto">{anuncio}</p>
          <CopiarTexto texto={anuncio} />
        </section>
      )}
      {pauta.consejos.length > 0 && (
        <section className="tarjeta pila">
          <h3>Consejos</h3>
          <ul className="est-lista">
            {pauta.consejos.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function Pasos({ titulo, pasos, abierto }: { titulo: string; pasos: string[]; abierto?: boolean }) {
  return (
    <details className="tarjeta est-pasos" open={abierto}>
      <summary>{titulo}</summary>
      <ol>
        {pasos.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ol>
    </details>
  );
}

export function DocumentoEstrategia({ markdown }: { markdown: string }) {
  return (
    <article className="tarjeta est-documento" data-patty="estratega-estrategia-resultado">
      <Contenido texto={markdown} alIr={() => {}} />
    </article>
  );
}

// ---------------------------------------------------------------- Fotos

const NOTAS: { clave: keyof FotoAnalizada["notas"]; nombre: string }[] = [
  { clave: "luz", nombre: "Luz" },
  { clave: "encuadre", nombre: "Encuadre" },
  { clave: "orden", nombre: "Orden" },
  { clave: "nitidez", nombre: "Nitidez" },
];

const tonoPuntaje = (p: number) => (p >= 75 ? "alto" : p >= 50 ? "medio" : "bajo");

function Puntaje({ valor }: { valor: number }) {
  return (
    <span className={`est-puntaje ${tonoPuntaje(valor)}`} aria-label={`Puntaje ${valor} de 100`}>
      {valor}
    </span>
  );
}

const enlaceMejorar = (casaId: string, f: FotoAnalizada) => `/panel/propiedades/${casaId}/redes?ver=imagen&img=${encodeURIComponent(f.original)}`;

function Portada({ titulo, formato, foto }: { titulo: string; formato: "feed" | "historia"; foto: FotoAnalizada | null }) {
  return (
    <figure className={`est-portada ${formato}`}>
      <figcaption>{titulo}</figcaption>
      {foto ? (
        <>
          <div className="est-portada-marco">
            {/* eslint-disable-next-line @next/next/no-img-element -- fotos del bucket del corredor, ya achicadas */}
            <img src={foto.url} alt={foto.muestra || NOMBRE_ESPACIO[foto.espacio]} loading="lazy" />
          </div>
          <span className="suave">
            {foto.nombre} · {NOMBRE_ESPACIO[foto.espacio]}
          </span>
        </>
      ) : (
        <p className="suave">Ninguna foto llega a portada: repite las más importantes con buena luz.</p>
      )}
    </figure>
  );
}

export function ResultadoFotos({ resumen, casaId, comentario }: { resumen: ResumenFotos; casaId: string; comentario: string }) {
  return (
    <div className="est-resultado" data-patty="estratega-fotos-resultado">
      <section className="tarjeta est-galeria-nota">
        <div>
          <span className="suave">Calidad de la galería</span>
          <strong className="est-grande">
            {resumen.promedio}
            <small> / 100</small>
          </strong>
        </div>
        {comentario && <p>{comentario}</p>}
      </section>

      <section className="tarjeta pila">
        <h3>Portadas recomendadas</h3>
        <div className="est-portadas" data-patty="estratega-fotos-portadas">
          <Portada titulo="Feed de Instagram (4:5)" formato="feed" foto={resumen.portadaFeed} />
          <Portada titulo="Historias y Reels (9:16)" formato="historia" foto={resumen.portadaHistoria} />
        </div>
      </section>

      <section className="tarjeta pila">
        <h3>Espacios que faltan</h3>
        {resumen.faltan.length ? (
          <>
            <Chips lista={resumen.faltan} />
            <p className="suave">El comprador los busca: tómalos en la próxima visita a la casa.</p>
          </>
        ) : (
          <p>Tiene fotos de todos los espacios clave.</p>
        )}
      </section>

      {resumen.aMejorar.length > 0 && (
        <section className="tarjeta pila">
          <h3>Para mejorar con IA</h3>
          <ul className="est-mejorar">
            {resumen.aMejorar.map((f) => (
              <li key={f.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de una foto propia */}
                <img src={f.url} alt="" loading="lazy" />
                <span>
                  <strong>
                    {f.nombre} · {NOMBRE_ESPACIO[f.espacio]}
                  </strong>
                  <span className="suave">{f.consejo || "Le falta luz o nitidez."}</span>
                </span>
                <Link href={enlaceMejorar(casaId, f)} className="boton chico" data-patty="estratega-fotos-mejorar">
                  Mejorar con IA
                </Link>
              </li>
            ))}
          </ul>
          <p className="suave">La mejora solo arregla luz, color y nitidez: la original queda guardada y tú decides cuál publicar.</p>
        </section>
      )}

      <section className="tarjeta pila">
        <h3>Orden del carrusel</h3>
        <ol className="est-carrusel" data-patty="estratega-fotos-carrusel">
          {resumen.carrusel.map((f) => (
            <li key={f.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de una foto propia */}
              <img src={f.url} alt={NOMBRE_ESPACIO[f.espacio]} loading="lazy" />
              <span>{NOMBRE_ESPACIO[f.espacio]}</span>
            </li>
          ))}
        </ol>
        <p className="suave">Abre con la portada, sigue con lo social y la cocina, luego lo privado y cierra con el afuera.</p>
      </section>

      <section className="tarjeta pila">
        <h3>Foto por foto</h3>
        <ul className="est-fotos">
          {resumen.fotos.map((f) => (
            <li key={f.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de una foto propia */}
              <img src={f.url} alt="" loading="lazy" />
              <div className="est-foto-cuerpo">
                <div className="est-foto-cabeza">
                  <strong>
                    {f.nombre} · {NOMBRE_ESPACIO[f.espacio]}
                  </strong>
                  <Puntaje valor={f.puntaje} />
                </div>
                {f.muestra && <p className="suave">{f.muestra}</p>}
                <dl className="est-notas">
                  {NOTAS.map((n) => (
                    <div key={n.clave}>
                      <dt>{n.nombre}</dt>
                      <dd>
                        <span className="est-barra" aria-hidden>
                          <span style={{ width: `${(f.notas[n.clave] / 5) * 100}%` }} />
                        </span>
                        <span className="est-nota-valor">{f.notas[n.clave]}/5</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                {f.consejo && <p className="est-consejo">{f.consejo}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
