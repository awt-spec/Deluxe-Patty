import type { Foto, Propiedad } from "@/lib/datos/tipos";
import { fotosPropias } from "@/lib/fotos/origen";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { MAX_FOTOS_ANALISIS } from "@/lib/redes/analisis-fotos";
import { fotosParaRedes, mejoresReales, opcionesDeFoto } from "@/lib/redes/fotos";
import { etiquetaCasa, precioCasa } from "@/lib/redes/texto";
import { EncabezadoPagina } from "../piezas";
import { Estratega, PESTANAS_ESTRATEGA, type CasaRedes, type PestanaEstratega } from "./estratega";
import "./redes-sociales.css";

// Redes sociales: la estratega comercial del corredor (posts, pautas en Meta, estrategia por casa y análisis de
// fotos). Se lee con la sesión del corredor (RLS) y solo sus casas a la venta o pausadas.

const COLUMNAS = "id, codigo, titulo, tipo, operacion, precio, moneda, zona, canton, habitaciones, banos, m2_construccion, m2_terreno, amenidades, estado, fotos";

export default async function RedesSociales({ searchParams }: { searchParams: Promise<{ casa?: string; ver?: string }> }) {
  const { casa, ver } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase.from("propiedades").select(COLUMNAS).eq("corredor_id", corredor.id).in("estado", ["activa", "reservada", "inactiva"]).order("codigo");
  const casas: CasaRedes[] = ((data ?? []) as (Propiedad & { fotos: Foto[] })[])
    .map((p) => ({
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      tipo: p.tipo,
      operacion: p.operacion,
      precio: p.precio,
      moneda: p.moneda,
      zona: p.zona,
      canton: p.canton,
      habitaciones: p.habitaciones,
      banos: p.banos,
      m2_construccion: p.m2_construccion,
      m2_terreno: p.m2_terreno,
      amenidades: p.amenidades ?? [],
      etiqueta: etiquetaCasa(p),
      precioTexto: precioCasa(p),
      pausada: p.estado === "inactiva",
      // Las mismas que analiza el servidor (la mejor versión real de cada foto, del bucket propio), en el mismo orden.
      fotos: mejoresReales(opcionesDeFoto(fotosParaRedes(p.fotos ?? [], corredor, fotosPropias)))
        .slice(0, MAX_FOTOS_ANALISIS)
        .map((o, i) => ({ id: `F${i + 1}`, url: o.url, nombre: o.nombre, ancho: null, alto: null, mejorada: o.tipo === "mejorada", original: o.original })),
    }))
    .sort((a, b) => Number(a.pausada) - Number(b.pausada));
  const pestana = PESTANAS_ESTRATEGA.some((p) => p.id === ver) ? (ver as PestanaEstratega) : "post";

  return (
    <>
      <EncabezadoPagina
        titulo="Redes sociales"
        apoyo="Tu estratega para Instagram y Facebook: mejora tus posts, planea pautas, arma la estrategia de cada casa y revisa las fotos."
        atras={{ href: "/panel/mas", texto: "Más", soloTelefono: true }}
      />
      <Estratega corredorId={corredor.id} asistente={corredor.nombre_asistente ?? "Patty"} casas={casas} casaInicial={casa ?? null} pestana={pestana} />
    </>
  );
}
