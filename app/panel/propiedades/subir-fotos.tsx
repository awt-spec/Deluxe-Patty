"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { pedirSubidas, registrarFotos } from "./acciones";

// Las fotos van directo del teléfono al bucket con un permiso de subida por archivo; antes se achican
// a 2400 px de lado (sobra para Encuentra24 y para la ficha) para que suban rápido con datos móviles.
const LADO_MAXIMO = 2400;

async function achicar(archivo: File): Promise<Blob> {
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.88));
    return blob ?? archivo;
  } catch {
    return archivo;
  }
}

export function SubirFotos({ propiedadId }: { propiedadId: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function subir(archivos: File[]) {
    if (archivos.length === 0) return;
    setOcupado(true);
    try {
      setEstado("Preparando…");
      const subidas = await pedirSubidas(
        propiedadId,
        archivos.map(() => "foto.jpg"),
      );
      if ("error" in subidas) return setEstado(subidas.error);
      const almacen = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      }).storage.from("fotos");
      const listos: string[] = [];
      for (const [i, archivo] of archivos.entries()) {
        setEstado(`Subiendo ${i + 1} de ${archivos.length}…`);
        const { camino, token } = subidas[i];
        const { error } = await almacen.uploadToSignedUrl(camino, token, await achicar(archivo), {
          contentType: "image/jpeg",
        });
        if (!error) listos.push(camino);
      }
      if (listos.length === 0) return setEstado("No se pudo subir ninguna foto. Revisa la conexión.");
      const r = await registrarFotos(propiedadId, listos);
      const faltaron = archivos.length - listos.length;
      setEstado(
        r.error ?? (faltaron ? `Listo, pero ${faltaron} no subieron: vuelve a intentarlo con esas.` : "Listo."),
      );
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
      {estado && (
        <p className="suave" role="status">
          {estado}
        </p>
      )}
    </div>
  );
}
