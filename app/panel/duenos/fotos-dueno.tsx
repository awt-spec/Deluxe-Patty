"use client";

import { useState } from "react";
import { IconoCasa } from "../iconos";

// Las fotos del anuncio en la tarjeta de un dueño: se muestran directo desde Encuentra24 (el servidor nunca las pide),
// sin mandar de qué página vienen. Si una no carga, se quita; si no queda ninguna, vuelve el dibujo de la casa. Las
// direcciones ya llegan validadas (solo https de *.encuentra24.com, lib/encuentra24/senales.ts).

/** Una foto de Encuentra24; si falla, `alFallar` (o nada). */
export function FotoE24({ url, alt, alFallar, className }: { url: string; alt: string; alFallar?: () => void; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- foto de afuera (Encuentra24), sin pasar por el optimizador
    <img src={url} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={className} onError={alFallar} />
  );
}

export function Marcador({ nota }: { nota: boolean }) {
  return (
    <div className="dd-foto-vacia">
      <IconoCasa tamano={30} />
      {nota && <span>Las fotos llegan en la próxima búsqueda</span>}
    </div>
  );
}

export function FotosDueno({ fotos, titulo }: { fotos: string[]; titulo: string }) {
  const [fallidas, setFallidas] = useState<string[]>([]);
  const [elegida, setElegida] = useState(0);
  const buenas = fotos.filter((f) => !fallidas.includes(f));
  if (buenas.length === 0) return <div className="dd-dueno-foto">{<Marcador nota={fotos.length === 0} />}</div>;
  const principal = buenas[Math.min(elegida, buenas.length - 1)];
  const fallar = (u: string) => () => setFallidas((x) => (x.includes(u) ? x : [...x, u]));
  return (
    <div className="dd-dueno-foto" data-con-foto="si">
      <FotoE24 key={principal} url={principal} alt={`Foto del anuncio: ${titulo}`} alFallar={fallar(principal)} className="dd-foto-principal" />
      {buenas.length > 1 && (
        <ul className="dd-fotos-tira" aria-label="Más fotos">
          {buenas.map((u, i) => (
            <li key={u}>
              <button type="button" onClick={() => setElegida(i)} aria-pressed={u === principal} aria-label={`Ver foto ${i + 1} de ${buenas.length}`}>
                <FotoE24 url={u} alt="" alFallar={fallar(u)} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface MarcaTarjeta {
  nombre: string;
  logo: string | null;
  colores: { principal: string; profundo: string; base: string };
}

/**
 * "Así se vería en tu Instagram": para mostrarle al dueño cómo se presentaría su casa. Se arma en el navegador con
 * HTML (la foto del anuncio y la marca del corredor encima), sin canvas: así no hace falta que Encuentra24 permita
 * leer la foto. Es ilustrativo: no se descarga ni se publica.
 */
export function InstagramDueno({ foto, marca, precio, zona }: { foto: string; marca: MarcaTarjeta; precio: string | null; zona: string | null }) {
  const [falla, setFalla] = useState(false);
  if (falla) return <p className="dd-insta-nota">No se pudo mostrar la foto de Encuentra24 aquí, así que no armé la vista de Instagram.</p>;
  return (
    <figure className="dd-insta" style={{ ["--ig-principal" as string]: marca.colores.principal, ["--ig-profundo" as string]: marca.colores.profundo, ["--ig-base" as string]: marca.colores.base }}>
      <div className="dd-insta-post">
        <div className="dd-insta-cabeza">
          <span className="dd-insta-avatar" aria-hidden>
            {marca.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo del corredor (ruta propia o https), tamaño fijo
              <img src={marca.logo} alt="" />
            ) : (
              marca.nombre.slice(0, 1)
            )}
          </span>
          <span className="dd-insta-nombre">{marca.nombre}</span>
        </div>
        <div className="dd-insta-foto">
          <FotoE24 url={foto} alt="La casa del anuncio, como se vería publicada" alFallar={() => setFalla(true)} />
          <span className="dd-insta-sello">Ilustrativo</span>
          <div className="dd-insta-banda">
            {precio && <strong>{precio}</strong>}
            <span>{zona ? `En venta · ${zona}` : "En venta"}</span>
            <em>{marca.nombre}</em>
          </div>
        </div>
      </div>
      <figcaption>Ilustrativo, para mostrarle al dueño. No se publica.</figcaption>
    </figure>
  );
}
