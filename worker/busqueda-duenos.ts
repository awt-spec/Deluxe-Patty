// Búsqueda semanal de dueños directos en Encuentra24. Corre en GitHub Actions
// (.github/workflows/busqueda-duenos.yml).
//
//   npx tsx worker/busqueda-duenos.ts                       búsqueda real para todos los corredores
//   npx tsx worker/busqueda-duenos.ts --prueba <zona> [n]   solo lee n páginas y muestra lo que encuentra
//   npm run duenos                                          búsqueda real desde la computadora de soporte,
//                                                           con Chrome visible (--visible) y .env.local
//
// Desde GitHub Actions Cloudflare casi siempre frena la lectura (sus servidores son de centro de datos);
// por eso la búsqueda semanal se corre con --visible desde una computadora con internet de casa, y si
// Encuentra24 pide verificar que es una persona, quien la corre lo resuelve en la ventana.
//
// Termina con código 1 si alguna búsqueda falla o no trae anuncios (el portal pudo cambiar):
// GitHub avisa por correo del workflow fallido.
import { createClient } from "@supabase/supabase-js";
import { crearCerebroClaude } from "../lib/asistente/cerebro";
import type { Dependencias } from "../lib/asistente/contexto";
import { conversacionDelCorredor, enviarAlCorredor } from "../lib/asistente/corredor";
import { crearRepositorioSupabase } from "../lib/datos/repositorio";
import { armarListaDuenos, buscarDuenos, semanaDe } from "../lib/encuentra24/busqueda";
import { bloqueados, corredoresConBusqueda, guardarLeads, idsVistos } from "../lib/encuentra24/datos";
import { anunciosDePagina, esDesafio, urlListado } from "../lib/encuentra24/parsear";
import { crearEnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { abrirNavegador } from "./navegador";
import { errorSeguro } from "../lib/monitoreo/errores";

const args = process.argv.slice(2);
const VISIBLE = args.includes("--visible");
// Perfil de Chrome propio de la búsqueda (cookies entre semanas), fuera del repositorio (.gitignore).
const opcionesVisible = VISIBLE ? { visible: { perfil: ".perfil-encuentra24" } } : {};

function requerida(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable ${nombre}`);
  return v;
}

async function prueba(zona: string, paginas: number) {
  const nav = await abrirNavegador({ pausaMinMs: 3000, pausaMaxMs: 6000, ...opcionesVisible });
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
  // Antes de abrir nada: si falta una variable se dice cuál (el nombre no es secreto), en vez del error
  // genérico que da el cliente de Claude sin llave.
  const faltan = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"].filter((v) => !process.env[v]);
  if (faltan.length) {
    console.error(`Faltan en .env.local: ${faltan.join(", ")}. Agrégalas y vuelve a correr la búsqueda.`);
    process.exit(1);
  }
  const db = createClient(requerida("SUPABASE_URL"), requerida("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  // Sin WhatsApp la búsqueda igual corre: los dueños quedan en la base y el corredor los ve en el panel
  // (Más → Dueños directos). Con WhatsApp, además se le manda la lista.
  const tokenWhatsApp = process.env.WHATSAPP_ACCESS_TOKEN || null;
  if (!tokenWhatsApp) console.log(JSON.stringify({ evento: "busqueda_sin_whatsapp" }));
  const deps: Dependencias = {
    repo: crearRepositorioSupabase(db),
    cerebro: crearCerebroClaude(),
    whatsapp: crearEnviadorWhatsApp(tokenWhatsApp ?? ""),
    plantillaAviso: process.env.WHATSAPP_PLANTILLA_AVISO ?? "aviso_corredor",
    plantillaRecordatorio: process.env.WHATSAPP_PLANTILLA_RECORDATORIO ?? "recordatorio_visita",
  };

  const ahora = new Date();
  const nav = await abrirNavegador(opcionesVisible);
  let fallas = 0;
  let guardados = 0;
  try {
    const corredores = await corredoresConBusqueda(db);
    if (corredores.length === 0) console.log("Ningún corredor tiene zonas de Encuentra24: cárgalas en el panel, en Más → Ajustes.");
    for (const corredor of corredores) {
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
        guardados += resultado.leads.length;
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

        if (tokenWhatsApp && corredor.whatsapp_corredor && corredor.whatsapp_phone_number_id) {
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
  if (VISIBLE) {
    console.log(
      fallas
        ? `Terminó con ${fallas} ${fallas === 1 ? "búsqueda fallida" : "búsquedas fallidas"} (arriba dice cuál).`
        : `Listo: ${guardados} ${guardados === 1 ? "dueño nuevo" : "dueños nuevos"}. Están en el panel, en Más → Dueños directos.`,
    );
  }
  if (fallas) process.exit(1);
}

const posicionales = args.filter((a) => a !== "--visible");
const [modo, zona, paginas] = posicionales;
(modo === "--prueba" ? prueba(zona ?? "san-jose-provincia-escazu", Number(paginas ?? 2)) : principal()).catch((e) => {
  console.error(JSON.stringify({ evento: "error_busqueda_duenos", error: errorSeguro(e) }));
  process.exit(1);
});
