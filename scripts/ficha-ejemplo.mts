// Genera una ficha de ejemplo para revisar el diseño:
//   npx tsx scripts/ficha-ejemplo.mts <salida.pdf> <foto-principal> [fotos de galería...]
import { writeFileSync } from "node:fs";
import { generarFicha } from "../lib/fichas/generar";
import { MARCA_DELUXE } from "../lib/fichas/marca";

const [salida, ...fotos] = process.argv.slice(2);
if (!salida) throw new Error("Uso: npx tsx scripts/ficha-ejemplo.mts <salida.pdf> <fotos...>");

generarFicha({
  marca: MARCA_DELUXE,
  whatsappAsistente: "+50660000000",
  propiedad: {
    id: "ejemplo",
    codigo: "EJEMPLO-001",
    titulo: "Residencia en condominio en San Rafael de Escazú",
    tipo: "casa",
    operacion: "venta",
    precio: 450000,
    moneda: "USD",
    provincia: "San José",
    canton: "Escazú",
    distrito: "San Rafael",
    zona: "Escazú",
    habitaciones: 3,
    banos: 3.5,
    m2_construccion: 320,
    m2_terreno: 500,
    descripcion:
      "Propiedad ficticia para revisar el diseño de la ficha. Residencia de tres habitaciones en un " +
      "condominio de baja densidad, con la luz natural y el jardín como ejes del diseño. Las áreas " +
      "sociales se abren a una terraza techada; la habitación principal tiene vestidor y baño propio.",
    amenidades: ["piscina", "seguridad 24/7", "terraza techada", "dos parqueos"],
    url_e24: null,
    estado: "activa",
    fotos: fotos.map((url, i) => ({ url, orden: i + 1 })),
  },
}).then((pdf) => {
  writeFileSync(salida, pdf);
  console.log(`ficha: ${salida} (${pdf.length} bytes)`);
});
