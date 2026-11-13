import Link from "next/link";
import { notFound } from "next/navigation";
import { telefonoBonito } from "@/lib/crm/perfil";
import type { Foto, Propiedad } from "@/lib/datos/tipos";
import type { Marca } from "@/lib/fichas/marca";
import { fotosPropias } from "@/lib/fotos/origen";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { fotosParaRedes, opcionesDeFoto } from "@/lib/redes/fotos";
import { textoPublicacion } from "@/lib/redes/texto";
import { datosDelVideo } from "@/lib/redes/video";
import { Volver } from "../../../volver";
import { Estudio, type Pestana } from "./estudio";
import "./redes.css";

// Estudio de redes de una casa: Imagen (post cuadrado e historia con la foto elegida), Video (con las fotos
// reales, armado en el teléfono) y Texto (editable, con IA). El precio y los datos salen siempre de la ficha.

const MARCA_NEUTRA: Marca["colores"] = { principal: "#00A884", soporte: "#667781", profundo: "#111B21", base: "#FFFFFF" };
const PESTANAS: Pestana[] = ["imagen", "video", "texto"];

export default async function Redes({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ img?: string; ver?: string }> }) {
  const { id } = await params;
  const { img, ver } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("propiedades")
    .select("id, codigo, titulo, operacion, tipo, precio, moneda, zona, canton, habitaciones, banos, m2_construccion, m2_terreno, amenidades, fotos")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as Propiedad & { fotos: Foto[] };
  const opciones = opcionesDeFoto(fotosParaRedes(p.fotos ?? [], corredor, fotosPropias));
  const texto = textoPublicacion(p, { nombre: corredor.nombre_contacto, whatsapp: corredor.whatsapp_numero });
  const marca = (corredor as { marca?: Marca | null }).marca ?? null;
  const logo = marca?.logoSobreProfundo
    ? /^https:\/\//.test(marca.logoSobreProfundo)
      ? marca.logoSobreProfundo
      : `/panel/propiedades/${p.id}/redes/foto?logo=1`
    : null;
  const sinMejorar =
    corredor.activo === false
      ? "En la demostración no se mejoran fotos."
      : corredor.imagenes_activas === false
        ? "Las imágenes con IA están apagadas para tu cuenta."
        : !process.env.OPENAI_API_KEY
          ? "La mejora de fotos con IA todavía no está configurada."
          : null;

  return (
    <>
      <Volver href={`/panel/propiedades/${p.id}`} texto={p.titulo} />
      <header className="encabezado">
        <h1>Para redes</h1>
      </header>
      {opciones.length === 0 ? (
        <p className="vacio">
          Primero sube fotos de la casa. <Link href={`/panel/propiedades/${p.id}#fotos`}>Ir a las fotos</Link>
        </p>
      ) : (
        <Estudio
          propiedadId={p.id}
          codigo={p.codigo}
          opciones={opciones}
          elegidaInicial={img ?? null}
          texto={texto}
          datosVideo={datosDelVideo(p, corredor.whatsapp_numero ? telefonoBonito(corredor.whatsapp_numero) : null, marca?.nombre ?? corredor.nombre)}
          colores={marca?.colores ?? MARCA_NEUTRA}
          fondoLogo={marca?.fondoLogo ?? marca?.colores.profundo ?? MARCA_NEUTRA.profundo}
          logo={logo}
          conMarca={!!marca}
          sinMejorar={sinMejorar}
          pestana={PESTANAS.includes(ver as Pestana) ? (ver as Pestana) : "imagen"}
        />
      )}
    </>
  );
}
