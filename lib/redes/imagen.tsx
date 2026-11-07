import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { Propiedad } from "../datos/tipos";
import type { Marca } from "../fichas/marca";
import { datosCortos, etiquetaCasa, precioCasa, TAMANOS, type Formato } from "./texto";

// Imagen para redes de una casa: la foto, el precio, la zona, los datos y la marca del corredor. La
// arma el código (no un modelo), así el precio y los datos son siempre los de la ficha. Si la foto es
// una versión hecha con IA (amueblada o limpia), lleva la leyenda "Imagen ilustrativa".

const MARCA_NEUTRA: Marca["colores"] = { principal: "#00A884", soporte: "#667781", profundo: "#111B21", base: "#FFFFFF" };

async function fuente(paquete: string, archivo: string): Promise<ArrayBuffer> {
  const datos = await readFile(path.join(process.cwd(), "node_modules", "@fontsource", paquete, "files", archivo));
  return datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer;
}

async function logoComoDato(logo: string | undefined): Promise<{ src: string } | null> {
  if (!logo) return null;
  if (/^https:\/\//.test(logo)) return { src: logo };
  const raiz = path.join(process.cwd(), "marcas");
  const archivo = path.resolve(process.cwd(), logo);
  if (!archivo.startsWith(raiz + path.sep)) return null;
  try {
    const datos = await readFile(archivo);
    const tipo = archivo.endsWith(".png") ? "image/png" : "image/jpeg";
    return { src: `data:${tipo};base64,${datos.toString("base64")}` };
  } catch {
    return null;
  }
}

export async function imagenRedes(opciones: {
  propiedad: Pick<
    Propiedad,
    "titulo" | "operacion" | "tipo" | "precio" | "moneda" | "zona" | "canton" | "habitaciones" | "banos" | "m2_construccion" | "m2_terreno"
  >;
  foto: string;
  ilustrativa: boolean;
  formato: Formato;
  marca: Marca | null;
  nombreCorredor: string;
  contacto: string | null;
}): Promise<ImageResponse> {
  const { propiedad: p, foto, ilustrativa, formato, marca, nombreCorredor, contacto } = opciones;
  const { ancho, alto } = TAMANOS[formato];
  const c = marca?.colores ?? MARCA_NEUTRA;
  const fondoLogo = marca?.fondoLogo ?? c.profundo;
  const logo = await logoComoDato(marca?.logoSobreProfundo);
  const [serif, sans, sansFuerte] = await Promise.all([
    fuente("playfair-display", "playfair-display-latin-500-normal.woff"),
    fuente("inter", "inter-latin-400-normal.woff"),
    fuente("inter", "inter-latin-600-normal.woff"),
  ]);
  const vertical = formato === "historia";
  const altoFoto = vertical ? 1180 : 640;
  const precioTexto = precioCasa(p);
  const datos = datosCortos(p);

  return new ImageResponse(
    (
      <div style={{ width: ancho, height: alto, display: "flex", flexDirection: "column", background: c.base, fontFamily: "Inter" }}>
        <div style={{ position: "relative", width: ancho, height: altoFoto, display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} width={ancho} height={altoFoto} style={{ width: ancho, height: altoFoto, objectFit: "cover" }} alt="" />
          <div
            style={{
              position: "absolute",
              left: 40,
              top: 40,
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: c.principal,
              color: c.profundo,
              fontSize: 30,
              fontWeight: 600,
            }}
          >
            {p.operacion === "alquiler" ? "EN ALQUILER" : "EN VENTA"}
          </div>
          {ilustrativa && (
            <div
              style={{
                position: "absolute",
                right: 32,
                bottom: 28,
                display: "flex",
                padding: "8px 18px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.62)",
                color: "#fff",
                fontSize: 24,
              }}
            >
              Imagen ilustrativa
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: vertical ? "56px 64px" : "34px 56px", gap: vertical ? 22 : 12, color: c.profundo }}>
          <div style={{ display: "flex", fontSize: vertical ? 32 : 26, color: c.soporte, letterSpacing: 1 }}>{etiquetaCasa(p).toUpperCase()}</div>
          <div style={{ display: "flex", fontFamily: "Playfair", fontSize: vertical ? 64 : 50, lineHeight: 1.12 }}>{p.titulo.slice(0, 70)}</div>
          {precioTexto && <div style={{ display: "flex", fontSize: vertical ? 64 : 52, fontWeight: 600, color: c.principal }}>{precioTexto}</div>}
          {datos.length > 0 && <div style={{ display: "flex", fontSize: vertical ? 34 : 28 }}>{datos.join("  ·  ")}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: vertical ? 220 : 130, padding: "0 56px", background: fondoLogo, color: c.base }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            // El logo se encaja en su caja sin deformarse, sea cuadrado o alargado.
            <img
              src={logo.src}
              width={vertical ? 420 : 300}
              height={vertical ? 170 : 104}
              style={{ width: vertical ? 420 : 300, height: vertical ? 170 : 104, objectFit: "contain", objectPosition: "left center" }}
              alt=""
            />
          ) : (
            <div style={{ display: "flex", fontFamily: "Playfair", fontSize: 40 }}>{nombreCorredor}</div>
          )}
          {contacto && <div style={{ display: "flex", fontSize: vertical ? 34 : 28, color: c.principal }}>WhatsApp {contacto}</div>}
        </div>
      </div>
    ),
    {
      width: ancho,
      height: alto,
      fonts: [
        { name: "Playfair", data: serif, weight: 500, style: "normal" },
        { name: "Inter", data: sans, weight: 400, style: "normal" },
        { name: "Inter", data: sansFuerte, weight: 600, style: "normal" },
      ],
    },
  );
}
