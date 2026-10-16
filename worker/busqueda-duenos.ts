// Búsqueda semanal de dueños directos en Encuentra24. Corre en GitHub Actions
// (.github/workflows/busqueda-duenos.yml).
//
//   npx tsx worker/busqueda-duenos.ts                       búsqueda real para todos los corredores
//   npx tsx worker/busqueda-duenos.ts --prueba <zona> [n]   solo lee n páginas y muestra lo que encuentra
//
// Termina con código 1 si alguna búsqueda falla o no trae anuncios (el portal pudo cambiar):
// GitHub avisa por correo del workflow fallido.
import { createClient } from "@supabase/supabase-js";
import { crearCerebroClaude } from "../lib/asistente/cerebro";
import type { Dependencias } from "../lib/asistente/contexto";
import { conversacionDelCorredor, enviarAlCorredor } from "../lib/asistente/corredor";
import { fechaIso, fechaLocal, sumarDias } from "../lib/agenda/tiempo";
import { crearRepositorioSupabase } from "../lib/datos/repositorio";
import { armarListaDuenos, buscarDuenos } from "../lib/encuentra24/busqueda";
import { bloqueados, corredoresConBusqueda, guardarLeads, idsVistos } from "../lib/encuentra24/datos";
import { anunciosDePagina, esDesafio, urlListado } from "../lib/encuentra24/parsear";
import { crearEnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { abrirNavegador } from "./navegador";
import { errorSeguro } from "../lib/monitoreo/errores";

function requerida(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable ${nombre}`);
  return v;
}

/** Lunes de la semana local, "YYYY-MM-DD". */
function semanaDe(ahora: Date, zona: string): string {
  const hoy = fechaLocal(ahora, zona);
  return fechaIso(sumarDias(hoy, -((hoy.diaSemana + 6) % 7)));
}

async function prueba(zona: string, paginas: number) {
  const nav = await abrirNavegador({ pausaMinMs: 3000, pausaMaxMs: 6000 });
  try {
    for (let n = 1; n <= paginas; n++) {
      const html = await nav.obtenerPagina(urlListado("bienes-raices-venta-de-propiedades-casas", zona, n));
      if (esDesafio(html)) {
        console.log(`página ${n}: desafío de Cloudflare sin resolver`);
        continue;
      }
      const anuncios = anunciosDePagina(html);
      const noAgentes = anuncios.filter((a) => a.tipoAnunciante !== "Agente");
      console.log(`página ${n}: ${anuncios.length} anuncios, ${noAgentes.length} no se declaran agente`);
      // Los registros de Actions son públicos: solo id, tipo y precio (el título puede traer nombre o
      // teléfono del dueño).
      for (const a of noAgentes) console.log(`  ${a.id} ${a.tipoAnunciante ?? "?"} · ${a.precio ?? "s/p"}`);
    }
  } finally {
    await nav.cerrar();
  }
}

async function principal() {
  const db = createClient(requerida("SUPABASE_URL"), requerida("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const deps: Dependencias = {
    repo: crearRepositorioSupabase(db),
    cerebro: crearCerebroClaude(),
    whatsapp: crearEnviadorWhatsApp(requerida("WHATSAPP_ACCESS_TOKEN")),
    plantillaAviso: process.env.WHATSAPP_PLANTILLA_AVISO ?? "aviso_corredor",
    plantillaRecordatorio: process.env.WHATSAPP_PLANTILLA_RECORDATORIO ?? "recordatorio_visita",
  };

  const ahora = new Date();
  const nav = await abrirNavegador();
  let fallas = 0;
  try {
    for (const corredor of await corredoresConBusqueda(db)) {
      try {
        const resultado = await buscarDuenos(
          {
            categoria: corredor.categoria_busqueda_e24,
            zonas: corredor.zonas_e24,
            precioMin: corredor.precio_busqueda_min,
            precioMax: corredor.precio_busqueda_max,
            yaVistos: await idsVistos(db, corredor.id),
            bloqueados: await bloqueados(db, corredor.id),
          },
          nav.obtenerPagina,
          deps.cerebro,
        );
        await guardarLeads(db, corredor.id, semanaDe(ahora, corredor.zona_horaria), resultado.leads);
        await deps.repo.registrarUso(corredor.id, {
          llamadasClaude: resultado.llamadasClaude,
          tokensEntrada: resultado.consumo.tokensEntrada,
          tokensSalida: resultado.consumo.tokensSalida,
          costoClaudeUsd: resultado.consumo.costoUsd,
        });
        console.log(
          JSON.stringify({
            evento: "busqueda_duenos",
            corredorId: corredor.id,
            paginas: resultado.paginas,
            anuncios: resultado.anunciosLeidos,
            candidatos: resultado.candidatos,
            descartados: resultado.descartadosPorCorredor,
            leads: resultado.leads.length,
          }),
        );

        if (corredor.whatsapp_corredor && corredor.whatsapp_phone_number_id) {
          const lista = armarListaDuenos(resultado.leads);
          const resumen =
            `Tu lista semanal de dueños directos está lista: ${resultado.leads.length} ` +
            `${resultado.leads.length === 1 ? "casa" : "casas"}. Respóndeme cualquier cosa y te la mando.`;
          const conversacion = await conversacionDelCorredor(deps, corredor);
          const entrega = await enviarAlCorredor(deps, corredor, conversacion, lista, {
            plantillaSiCerrada: resumen,
            ahora,
          });
          if (entrega === "plantilla") await deps.repo.guardarEnvioPendiente(corredor.id, "lista_duenos", lista);
        }
      } catch (error) {
        fallas++;
        console.error(JSON.stringify({ evento: "error_busqueda_duenos", corredorId: corredor.id, error: errorSeguro(error) }));
      }
    }
  } finally {
    await nav.cerrar();
  }
  if (fallas) process.exit(1);
}

const [modo, zona, paginas] = process.argv.slice(2);
(modo === "--prueba" ? prueba(zona ?? "san-jose-provincia-escazu", Number(paginas ?? 2)) : principal()).catch((e) => {
  console.error(JSON.stringify({ evento: "error_busqueda_duenos", error: errorSeguro(e) }));
  process.exit(1);
});
