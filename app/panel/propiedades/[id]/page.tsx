import { IconoAbajo, IconoArriba, IconoDocumento, IconoEstrella, IconoMegafono } from "../../iconos";
import { Volver } from "../../volver";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Foto } from "@/lib/datos/tipos";
import { MAX_FOTOS_PROPIEDAD, ordenarFotos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { PreguntarPatty } from "../../preguntar-patty";
import { Avatar } from "../../avatar";
import { NOMBRE_ETAPA, encaja, resumenBusca, telefonoBonito, type Busca, type Etapa } from "@/lib/crm/perfil";
import { BotonEnviar } from "../../boton-enviar";
import {
  cambiarEstado,
  generarFicha,
  guardarPropiedad,
  mejorarFotosPanel,
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

  return (
    <>
      <Volver href="/panel/propiedades" texto="Mis casas" />
      <header className="encabezado">
        <div style={{ minWidth: 0 }}>
          <h1>{p.titulo}</h1>
          <p className="suave">{p.codigo}</p>
        </div>
      </header>
      <Aviso texto={aviso} />
      <div className="preguntas-patty">
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿A qué clientes les sirve esta casa?" />
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="Escríbeme un texto para ofrecerla" />
      </div>

      {interesados.length > 0 && (
        <section className="tarjeta pila encajan" data-patty="casa-clientes">
          <h2>
            Le sirve a {interesados.length} {interesados.length === 1 ? "cliente" : "clientes"}
          </h2>
          <p className="suave">Por lo que dijeron que buscan. Ofrécesela antes de que se la lleve otro.</p>
          <ul className="encajan-lista">
            {interesados.map((c) => (
              <li key={c.id}>
                <Link href={`/panel/clientes/${c.id}`}>
                  <Avatar nombre={c.nombre} telefono={c.telefono} />
                  <span>
                    <strong>{c.nombre ?? telefonoBonito(c.telefono)}</strong>
                    <span className="suave">
                      {NOMBRE_ETAPA[c.etapa]} · {resumenBusca(c.busca ?? {})}
                    </span>
                  </span>
                </Link>
                <a className="boton" target="_blank" rel="noreferrer" href={`https://wa.me/${c.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola${c.nombre ? ` ${c.nombre.split(" ")[0]}` : ""}, le escribe ${corredor.nombre_contacto} de ${corredor.nombre}. Tengo una propiedad que encaja con lo que busca: ${p.titulo}. ¿Le gustaría que le mande fotos o coordinar una visita?`)}`}>
                  Ofrecérsela
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pila" style={{ marginBottom: 8 }}>
        <form action={generarFicha}>
          <input type="hidden" name="id" value={p.id} />
          <BotonEnviar texto={<><IconoDocumento tamano={24} /> Ficha para mandar a un cliente</>} pendiente="Armando la ficha…" className="primario grande" />
        </form>
        <form action={prepararAnuncioPanel}>
          <input type="hidden" name="id" value={p.id} />
          <BotonEnviar texto={<><IconoMegafono tamano={24} /> Escribir el anuncio de Encuentra24</>} pendiente="Escribiendo el anuncio…" className="grande" />
        </form>
      </section>

      <h2 id="fotos">Fotos</h2>
      <p className="suave">
        La primera es la que se ve en la ficha y en el anuncio.
      </p>
      {fotos.length === 0 && <p className="vacio">Todavía no tiene fotos.</p>}
      <div className="galeria">
        {fotos.map((f, i) => (
          <figure key={f.url} className="tarjeta pila">
            <a href={f.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`Foto ${i + 1}`} loading="lazy" />
            </a>
            <figcaption className="suave">
              {i === 0 ? <><IconoEstrella tamano={16} /> Principal</> : `Foto ${i + 1}`}
              {f.mejorada_url && (
                <>
                  {" · "}
                  <a href={f.mejorada_url} target="_blank" rel="noreferrer">
                    ver mejorada
                  </a>
                </>
              )}
            </figcaption>
            <div className="botones">
              {i > 0 && <BotonFoto id={p.id} url={f.url} accion="principal" texto={<><IconoEstrella tamano={18} /> Principal</>} />}
              {i > 0 && <BotonFoto id={p.id} url={f.url} accion="subir" texto={<IconoArriba tamano={20} />} etiqueta="Subir" />}
              {i < fotos.length - 1 && <BotonFoto id={p.id} url={f.url} accion="bajar" texto={<IconoAbajo tamano={20} />} etiqueta="Bajar" />}
              <BotonFoto id={p.id} url={f.url} accion="quitar" texto="Quitar" peligro />
            </div>
          </figure>
        ))}
      </div>
      {fotos.length < MAX_FOTOS_PROPIEDAD && <SubirFotos propiedadId={p.id} />}
      {fotosActivas && fotos.length > 0 && (
        <form action={mejorarFotosPanel} className="pila tarjeta">
          <input type="hidden" name="id" value={p.id} />
          <p className="suave">
            Mejora la luz y el color de las fotos. Tarda unos minutos. Tus fotos originales no se tocan: revisa las
            mejoradas antes de usarlas.
          </p>
          <BotonEnviar texto="Mejorar fotos" pendiente="Mejorando… puede tardar unos minutos" />
        </form>
      )}

      <h2>¿Sigue disponible?</h2>
      {p.estado !== "activa" ? (
        <form action={cambiarEstado}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="estado" value="activa" />
          <p className="suave">La asistente no la está ofreciendo.</p>
          <button type="submit" className="grande">
            Volver a ofrecerla
          </button>
        </form>
      ) : (
        <div className="botones">
          <form action={cambiarEstado}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="estado" value={p.operacion === "alquiler" ? "alquilada" : "vendida"} />
            <button type="submit" className="grande">
              {p.operacion === "alquiler" ? "Ya se alquiló" : "Ya se vendió"}
            </button>
          </form>
          <form action={cambiarEstado}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="estado" value="inactiva" />
            <button type="submit" className="grande">
              Pausarla
            </button>
          </form>
        </div>
      )}

      <details style={{ marginTop: 20 }}>
        <summary>Ver o cambiar todos los datos</summary>
        <FormularioPropiedad p={p} accion={guardarPropiedad} boton="Guardar cambios" />
      </details>
    </>
  );
}
