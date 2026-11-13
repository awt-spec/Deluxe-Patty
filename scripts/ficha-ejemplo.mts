// Genera una ficha de ejemplo para revisar el diseño:
//   npx tsx scripts/ficha-ejemplo.mts <salida.pdf> [opciones] <foto-principal> [fotos de galería...]
// Opciones para casos borde: --neutra (sin marca), --alquiler, --colones, --sin-precio, --sin-descripcion,
// --titulo-largo, --ilustrativa (marca la 2.ª foto como variante con IA).
// Para revisarla página por página: pdftoppm -r 70 -png salida.pdf salida-p
import { writeFileSync } from "node:fs";
import { generarFicha } from "../lib/fichas/generar";
import { MARCA_DELUXE, marcaNeutra } from "../lib/fichas/marca";

const [salida, ...resto] = process.argv.slice(2);
if (!salida) throw new Error("Uso: npx tsx scripts/ficha-ejemplo.mts <salida.pdf> [opciones] <fotos...>");
const opciones = new Set(resto.filter((a) => a.startsWith("--")));
const fotos = resto.filter((a) => !a.startsWith("--"));
const con = (o: string) => opciones.has(o);

generarFicha({
  marca: con("--neutra") ? marcaNeutra("Inmobiliaria Ejemplo") : MARCA_DELUXE,
  whatsappAsistente: "+50660000000",
  propiedad: {
    id: "ejemplo",
    codigo: "EJEMPLO-001",
    titulo: con("--titulo-largo")
      ? "Residencia contemporánea en condominio de baja densidad con vista panorámica al Valle Central, jardín privado y terraza techada en San Rafael de Escazú"
      : "Residencia en condominio en San Rafael de Escazú",
    tipo: "casa",
    operacion: con("--alquiler") ? "alquiler" : "venta",
    precio: con("--sin-precio") ? null : con("--alquiler") ? 3200 : con("--colones") ? 245000000 : 450000,
    moneda: con("--colones") ? "CRC" : "USD",
    provincia: "San José",
    canton: "Escazú",
    distrito: "San Rafael",
    zona: "Escazú",
    habitaciones: 3,
    banos: 3.5,
    m2_construccion: 320,
    m2_terreno: 500,
    descripcion: con("--sin-descripcion")
      ? null
      : "Propiedad ficticia para revisar el diseño de la ficha. Residencia de tres habitaciones en un condominio de baja densidad, con la luz natural y el jardín como ejes del diseño.\n\n" +
        "Las áreas sociales se abren a una terraza techada con vista al jardín; la cocina es abierta, con isla y desayunador. " +
        "La habitación principal tiene vestidor y baño propio, y las otras dos comparten un baño completo.\n\n" +
        "El condominio tiene seguridad las 24 horas, casa club y senderos, a cinco minutos de colegios y comercios.",
    amenidades: ["piscina", "seguridad 24/7", "terraza techada", "dos parqueos", "cuarto de servicio", "bodega", "jardín privado"],
    url_e24: null,
    estado: "activa",
    fotos: fotos.map((url, i) => ({ url, orden: i + 1 })),
  },
}).then((pdf) => {
  writeFileSync(salida, pdf);
  console.log(`ficha: ${salida} (${pdf.length} bytes)`);
});
