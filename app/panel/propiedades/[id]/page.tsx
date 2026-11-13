import { IconoAbajo, IconoArriba, IconoCamara, IconoDocumento, IconoEstrella, IconoMegafono } from "../../iconos";
import { ComoLlegar } from "../../como-llegar";
import { precio } from "@/lib/formato";
import { Volver } from "../../volver";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Foto } from "@/lib/datos/tipos";
import { ordenarFotos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { PreguntarPatty } from "../../preguntar-patty";
import { Avatar } from "../../avatar";
import { NOMBRE_ETAPA, encaja, telefonoBonito, type Busca, type Etapa } from "@/lib/crm/perfil";
import { BotonEnviar } from "../../boton-enviar";
import {
  cambiarEstado,
  generarFicha,
  guardarPropiedad,
  amueblarFoto,
  limpiarFoto,
  mejorarFotosPanel,
  quitarVariante,
  ordenarFoto,
  prepararAnuncioPanel,
} from "../acciones";
import { FormularioPropiedad, type PropiedadFormulario } from "../formulario";
import { SubirFotos } from "../subir-fotos";

// La mejora de fotos con IA puede tardar varios minutos.
export const maxDuration = 300;

function BotonFoto({
  id,
  url,
  accion,
  texto,
  etiqueta,
  peligro,
}: {
  id: string;
  url: string;
  accion: string;
  texto: React.ReactNode;
  etiqueta?: string;
  peligro?: boolean;
}) {
  return (
    <form action={ordenarFoto}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="url" value={url} />
      <input type="hidden" name="accion" value={accion} />
      <button type="submit" className={`chico ${peligro ? "peligro" : ""}`} aria-label={etiqueta}>
        {texto}
      </button>
    </form>
  );
}

export default async function Propiedad({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { id } = await params;
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("propiedades")
    .select(
      "id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado, fotos",
    )
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as PropiedadFormulario & { id: string; fotos: Foto[] };
  const fotos = ordenarFotos(p.fotos);
  const fotosActivas = !!process.env.OPENAI_API_KEY;
  // Amueblar y quitar objetos: con OpenAI configurado, imágenes permitidas y fuera de la demo.
  const imagenesIA = fotosActivas && corredor.imagenes_activas !== false && corredor.activo !== false;
  // Clientes activos a los que les sirve esta casa por lo que dijeron que buscan.
  const { data: clientesData } = await supabase
    .from("contactos")
    .select("id, nombre, telefono, etapa, busca")
    .eq("corredor_id", corredor.id)
    .eq("es_corredor", false)
    .not("etapa", "in", "(cerrado,perdido)")
    .limit(500);
  const interesados = ((clientesData ?? []) as { id: string; nombre: string | null; telefono: string; etapa: Etapa; busca: Busca }[])
    .filter((c) => p.estado === "activa" && encaja(c.busca ?? {}, p as never))
    .slice(0, 12);

  // Movimiento de la casa: visitas y clientes que la tienen como "la que le interesa".
  const [{ count: visitas }, { count: interesadosEnElla }] = await Promise.all([
    supabase.from("citas").select("id", { count: "exact", head: true }).eq("corredor_id", corredor.id).eq("propiedad_id", p.id),
    supabase.from("contactos").select("id", { count: "exact", head: true }).eq("corredor_id", corredor.id).eq("propiedad_interes_id", p.id),
  ]);
  const ESTADO_CASA: Record<string, string> = {
    activa: "Disponible",
    reservada: "Reservada",
    vendida: "Vendida",
    alquilada: "Alquilada",
    inactiva: "Pausada",
  };
  const TIPO: Record<string, string> = { casa: "Casa", apartamento: "Apartamento", lote: "Lote", local: "Local", oficina: "Oficina", finca: "Finca", otro: "Propiedad" };
  const lugar = [p.zona, p.canton && p.canton !== p.zona ? p.canton : null, p.provincia].filter(Boolean).join(", ");
  const datos = [
    p.habitaciones !== null ? { valor: String(p.habitaciones), nombre: p.habitaciones === 1 ? "cuarto" : "cuartos" } : null,
    p.banos !== null ? { valor: String(p.banos).replace(".", ","), nombre: p.banos === 1 ? "baño" : "baños" } : null,
    p.m2_construccion !== null ? { valor: Number(p.m2_construccion).toLocaleString("es-CR"), nombre: "m² construidos" } : null,
    p.m2_terreno !== null ? { valor: Number(p.m2_terreno).toLocaleString("es-CR"), nombre: "m² de terreno" } : null,
  ].filter((d): d is { valor: string; nombre: string } => !!d);
  const principal = fotos[0];

  return (
    <>
      <Volver href="/panel/propiedades" texto="Mis casas" />
      <Aviso texto={aviso} />

      {/* Portada: la foto principal y lo que todo cliente pregunta primero */}
      <section className={`casa-portada estado-${p.estado}`}>
        <div className="casa-portada-fotos">
          {principal ? (
            <a href={principal.url} target="_blank" rel="noreferrer" className="casa-portada-principal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={principal.url} alt={p.titulo} />
            </a>
          ) : (
            <a href="#fotos" className="casa-portada-principal sin-foto">
              <IconoCamara tamano={40} />
              <span>Sube las fotos de la casa</span>
            </a>
          )}
          {fotos.length > 1 && (
            <div className="casa-portada-miniaturas">
              {fotos.slice(1, 5).map((f, i) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`Foto ${i + 2}`} loading="lazy" />
                  {i === 3 && fotos.length > 5 && <span>+{fotos.length - 5}</span>}
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="casa-portada-datos">
          <div className="casa-portada-etiquetas">
            <span className={`casa-estado ${p.estado}`}>{ESTADO_CASA[p.estado] ?? p.estado}</span>
            <span className="suave">
              {TIPO[p.tipo] ?? p.tipo} en {p.operacion === "alquiler" ? "alquiler" : "venta"} · {p.codigo}
            </span>
          </div>
          <h1>{p.titulo}</h1>
          {lugar && <p className="casa-lugar">{lugar}</p>}
          <p className="casa-precio">
            {p.precio ? precio(p.precio, p.moneda) : "Sin precio"}
            {p.operacion === "alquiler" && p.precio ? <span> al mes</span> : null}
          </p>
          {datos.length > 0 && (
            <div className="casa-datos">
              {datos.map((d) => (
                <span key={d.nombre}>
                  <strong>{d.valor}</strong> {d.nombre}
                </span>
              ))}
            </div>
          )}
          <p className="suave casa-movimiento">
            {visitas ?? 0} {visitas === 1 ? "visita" : "visitas"} · {interesadosEnElla ?? 0}{" "}
            {interesadosEnElla === 1 ? "cliente interesado" : "clientes interesados"}
            {interesados.length > 0 ? ` · le sirve a ${interesados.length} más` : ""}
          </p>
          <div className="casa-acciones">
            <form action={generarFicha}>
              <input type="hidden" name="id" value={p.id} />
              <BotonEnviar texto={<><IconoDocumento tamano={20} /> Ficha para un cliente</>} pendiente="Armando la ficha…" className="primario" />
            </form>
            <form action={prepararAnuncioPanel}>
              <input type="hidden" name="id" value={p.id} />
              <BotonEnviar texto={<><IconoMegafono tamano={20} /> Anuncio de Encuentra24</>} pendiente="Escribiendo el anuncio…" />
            </form>
            {fotos.length > 0 && (
              <Link href={`/panel/propiedades/${p.id}/redes`} className="boton" data-patty="casa-redes">
                Imagen para redes
              </Link>
            )}
            {p.url_e24 && (
              <a href={p.url_e24} target="_blank" rel="noreferrer" className="boton">
                Ver en Encuentra24
              </a>
            )}
            {p.zona && <ComoLlegar casa={{ zona: p.zona, canton: p.canton }} chico />}
          </div>
        </div>
      </section>

      <div className="preguntas-patty">
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿A qué clientes les sirve esta casa?" />
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="Escríbeme un texto para ofrecerla" />
      </div>

      <div className="ficha-grid">
        <div className="ficha-principal">
          {(p.descripcion || p.amenidades.length > 0) && (
            <section className="tarjeta pila">
              <h2>Cómo es</h2>
              {p.descripcion && <p className="casa-descripcion">{p.descripcion}</p>}
              {p.amenidades.length > 0 && (
                <ul className="casa-amenidades">
                  {p.amenidades.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="tarjeta pila" id="fotos">
            <div className="fila">
              <h2>Fotos ({fotos.length})</h2>
              <span className="suave">La primera es la de la ficha y el anuncio.</span>
            </div>
            {fotos.length === 0 && <p className="vacio">Todavía no tiene fotos.</p>}
            <div className="galeria casa-galeria">
              {fotos.map((f, i) => (
                <figure key={f.url} className="casa-foto">
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={`Foto ${i + 1}`} loading="lazy" />
                    {i === 0 && (
                      <span className="casa-foto-principal">
                        <IconoEstrella tamano={14} /> Principal
                      </span>
                    )}
                  </a>
                  <div className="casa-foto-botones">
                    {i > 0 && <BotonFoto id={p.id} url={f.url} accion="principal" texto={<IconoEstrella tamano={16} />} etiqueta="Hacerla la principal" />}
                    {i > 0 && <BotonFoto id={p.id} url={f.url} accion="subir" texto={<IconoArriba tamano={16} />} etiqueta="Antes" />}
                    {i < fotos.length - 1 && <BotonFoto id={p.id} url={f.url} accion="bajar" texto={<IconoAbajo tamano={16} />} etiqueta="Después" />}
                    <BotonFoto id={p.id} url={f.url} accion="quitar" texto="Quitar" peligro />
                  </div>
                  {f.mejorada_url && (
                    <a className="casa-foto-mejorada" href={f.mejorada_url} target="_blank" rel="noreferrer">
                      Ver mejorada
                    </a>
                  )}
                  {(f.variantes ?? []).length > 0 && (
                    <ul className="casa-variantes" aria-label="Imágenes ilustrativas">
                      {(f.variantes ?? []).map((v) => (
                        <li key={v.url}>
                          <a href={v.url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={v.url} alt={v.tipo === "amueblada" ? "Amueblada (ilustrativa)" : "Sin objetos (ilustrativa)"} loading="lazy" />
                            <span className="casa-variante-etiqueta">{v.tipo === "amueblada" ? "Amueblada" : "Limpia"} · ilustrativa</span>
                          </a>
                          <form action={quitarVariante}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="url" value={f.url} />
                            <input type="hidden" name="variante" value={v.url} />
                            <button type="submit" className="chico enlace" aria-label="Quitar esta imagen">
                              Quitar
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  {imagenesIA && (
                    <details className="casa-foto-ia" data-patty={i === 0 ? "casa-foto-ia" : undefined}>
                      <summary>Con IA: amueblar o quitar cosas</summary>
                      <form action={amueblarFoto} className="pila">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="url" value={f.url} />
                        <label>
                          Amueblar un cuarto vacío
                          <select name="estilo" defaultValue="moderno">
                            <option value="moderno">Moderno</option>
                            <option value="minimalista">Minimalista</option>
                            <option value="clasico">Clásico</option>
                            <option value="tropical">Tropical</option>
                          </select>
                        </label>
                        <input name="cuarto" type="text" maxLength={80} placeholder="¿Qué cuarto es? (sala, cuarto principal…)" />
                        <BotonEnviar texto="Amueblar" pendiente="Amueblando… tarda un minuto" className="chico" />
                      </form>
                      <form action={limpiarFoto} className="pila">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="url" value={f.url} />
                        <label>
                          Quitar objetos
                          <input name="quitar" type="text" maxLength={300} required placeholder="Ej.: el carro rojo y los cables" />
                        </label>
                        <BotonEnviar texto="Quitar" pendiente="Limpiando… tarda un minuto" className="chico" />
                      </form>
                      <p className="suave">Se guarda aparte: tu foto no cambia. Al publicarla, di que es ilustrativa.</p>
                    </details>
                  )}
                </figure>
              ))}
            </div>
            <SubirFotos propiedadId={p.id} actuales={fotos.length} />
            {fotosActivas && fotos.length > 0 && (
              <form action={mejorarFotosPanel} className="pila casa-mejorar">
                <input type="hidden" name="id" value={p.id} />
                <p className="suave">
                  Mejora la luz y el color. Tarda unos minutos y tus originales no se tocan: revisa las mejoradas antes de usarlas.
                </p>
                <BotonEnviar texto="Mejorar fotos" pendiente="Mejorando… puede tardar unos minutos" />
              </form>
            )}
          </section>
        </div>

        <aside className="ficha-lateral">
          {interesados.length > 0 && (
            <section className="tarjeta pila encajan" data-patty="casa-clientes">
              <h2>
                Le sirve a {interesados.length} {interesados.length === 1 ? "cliente" : "clientes"}
              </h2>
              <p className="suave">Por lo que dijeron que buscan.</p>
              <ul className="encajan-lista">
                {interesados.map((c) => (
                  <li key={c.id}>
                    <Link href={`/panel/clientes/${c.id}`}>
                      <Avatar nombre={c.nombre} telefono={c.telefono} />
                      <span>
                        <strong>{c.nombre ?? telefonoBonito(c.telefono)}</strong>
                        <span className="suave">{NOMBRE_ETAPA[c.etapa]}</span>
                      </span>
                    </Link>
                    <a
                      className="boton"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://wa.me/${c.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola${c.nombre ? ` ${c.nombre.split(" ")[0]}` : ""}, le escribe ${corredor.nombre_contacto} de ${corredor.nombre}. Tengo una propiedad que encaja con lo que busca: ${p.titulo}. ¿Le gustaría que le mande fotos o coordinar una visita?`)}`}
                    >
                      Ofrecérsela
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="tarjeta pila">
            <h2>¿Sigue disponible?</h2>
            {p.estado !== "activa" ? (
              <form action={cambiarEstado} className="pila">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="estado" value="activa" />
                <p className="suave">
                  La asistente no la está ofreciendo.
                  {p.estado === "inactiva" && p.url_e24
                    ? " Si la trajiste desde un anuncio de Encuentra24, revisa los datos y las fotos antes de volver a ofrecerla."
                    : ""}
                </p>
                <button type="submit" className="primario chico">
                  Volver a ofrecerla
                </button>
              </form>
            ) : (
              <>
                <p className="suave">La asistente la está ofreciendo a los clientes.</p>
                <div className="botones casa-estado-botones">
                  <form action={cambiarEstado}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="estado" value={p.operacion === "alquiler" ? "alquilada" : "vendida"} />
                    <button type="submit" className="chico">
                      {p.operacion === "alquiler" ? "Ya se alquiló" : "Ya se vendió"}
                    </button>
                  </form>
                  <form action={cambiarEstado}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="estado" value="inactiva" />
                    <button type="submit" className="chico">
                      Pausarla
                    </button>
                  </form>
                </div>
              </>
            )}
          </section>

          <details className="tarjeta pila casa-editar">
            <summary>Cambiar los datos de la casa</summary>
            <FormularioPropiedad p={p} accion={guardarPropiedad} boton="Guardar cambios" />
          </details>
        </aside>
      </div>
    </>
  );
}
