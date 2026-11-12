"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { pedirSubidas, registrarFotos } from "./acciones";

// Las fotos van directo del teléfono al bucket con un permiso de subida por archivo; antes se achican
// a 2400 px de lado (sobra para Encuentra24 y para la ficha) para que suban rápido con datos móviles.
const LADO_MAXIMO = 2400;

// Al volver a dibujar la foto se le quitan los datos ocultos (como la ubicación GPS). Si el teléfono no
// la puede convertir, no se sube el original: devuelve null y se avisa.
async function achicar(archivo: File): Promise<Blob | null> {
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.88));
  } catch {
    return null;
  }
}

const POR_TANDA = 12;
const MAXIMO_CASA = 30;

export function SubirFotos({ propiedadId, actuales }: { propiedadId: string; actuales?: number }) {
  const router = useRouter();
  const [estado, setEstado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function subir(elegidas: File[]) {
    if (elegidas.length === 0) return;
    const cupo = actuales === undefined ? elegidas.length : MAXIMO_CASA - actuales;
    if (cupo <= 0) return setEstado(`Ya tiene ${MAXIMO_CASA} fotos. Quita alguna para subir otras.`);
    const archivos = elegidas.slice(0, cupo);
    let sobran = elegidas.length - archivos.length;
    setOcupado(true);
    try {
      setEstado("Preparando…");
      const almacen = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      }).storage.from("fotos");
      let guardadas = 0;
      let noLeidas = 0;
      let noSubieron = 0;
      let fallo: string | null = null;
      for (let desde = 0; desde < archivos.length; desde += POR_TANDA) {
        const tanda = archivos.slice(desde, desde + POR_TANDA);
        const subidas = await pedirSubidas(
          propiedadId,
          tanda.map(() => "foto.jpg"),
        );
        if ("error" in subidas) {
          fallo = subidas.error;
          break;
        }
        const listos: string[] = [];
        for (const [i, archivo] of tanda.entries()) {
          setEstado(`Subiendo ${desde + i + 1} de ${archivos.length}…`);
          const foto = await achicar(archivo);
          if (!foto) {
            noLeidas++;
            continue;
          }
          const { camino, token } = subidas[i];
          const { error } = await almacen.uploadToSignedUrl(camino, token, foto, { contentType: "image/jpeg" });
          if (error) noSubieron++;
          else listos.push(camino);
        }
        if (listos.length === 0) continue;
        const r = await registrarFotos(propiedadId, listos);
        if (r.error) {
          fallo = r.error;
          break;
        }
        guardadas += r.guardadas ?? listos.length;
        sobran += r.descartadas ?? 0;
      }
      const partes: string[] = [];
      if (fallo) partes.push(fallo);
      else if (guardadas === 0 && noLeidas === 0 && noSubieron > 0) partes.push("No se pudo subir ninguna foto. Revisa la conexión.");
      else if (sobran > 0) {
        partes.push(`Subí ${guardadas}. Las otras ${sobran} no entraron: una casa lleva hasta ${MAXIMO_CASA} fotos. Quita alguna para poner otras.`);
      } else if (guardadas > 0) partes.push("Listo.");
      if (noLeidas > 0) {
        partes.push(`${noLeidas} ${noLeidas === 1 ? "foto no se pudo leer" : "fotos no se pudieron leer"}: mándalas como JPG.`);
      }
      if (noSubieron > 0 && guardadas > 0) {
        partes.push(`${noSubieron} no subieron. Vuelve a intentarlo con esas.`);
      }
      setEstado(partes.join(" "));
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="pila">
      <label htmlFor="fotos-nuevas" className={`boton ${ocupado ? "" : "primario"}`} aria-disabled={ocupado}>
        {ocupado ? "Subiendo…" : "Agregar fotos"}
      </label>
      <input
        id="fotos-nuevas"
        type="file"
        accept="image/*"
        multiple
        disabled={ocupado}
        className="oculto"
        onChange={(e) => {
          const archivos = [...(e.target.files ?? [])];
          e.target.value = "";
          void subir(archivos);
        }}
      />
      <p className="suave subir-fotos-ayuda">
        Hasta {POR_TANDA} fotos por vez · {MAXIMO_CASA} por casa
        {actuales !== undefined && ` · Llevas ${actuales} de ${MAXIMO_CASA}`}
      </p>
      {estado && (
        <p className="suave" role="status">
          {estado}
        </p>
      )}
    </div>
  );
}
