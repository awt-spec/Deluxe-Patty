// Crea (o deja como nueva) la cuenta de demo: un corredor inactivo con la marca de Deluxe y datos
// ficticios, y el usuario DEMO_CORREO enlazado solo a él. Se entra con "Ver la demo" en /entrar.
//
//   npm run demo        (lee SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y DEMO_CORREO de .env.local)
//
// DEMO_CORREO no necesita buzón: nunca se le manda un correo. Va también en Vercel para que aparezca el
// botón. Volver a correrlo borra lo que los visitantes cambiaron y carga todo de nuevo.
import { createClient } from "@supabase/supabase-js";
import { MARCA_DELUXE } from "../lib/fichas/marca";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const correo = process.env.DEMO_CORREO?.trim().toLowerCase();
if (!url || !llave || !correo) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DEMO_CORREO (en .env.local).");
  process.exit(1);
}
const db = createClient(url, llave, { auth: { persistSession: false } });

const ID = "00000000-0000-4000-8000-0000000000de";
const ahora = Date.now();
const hace = (min: number) => new Date(ahora - min * 60_000).toISOString();
// Costa Rica no cambia de horario: UTC−6. `dias` desde hoy a la hora local indicada.
function horaCR(dias: number, hora: number): Date {
  const hoy = new Date(ahora - 6 * 3600_000);
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + dias, hora + 6));
}
const lunesCR = (() => {
  const hoy = new Date(ahora - 6 * 3600_000);
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - ((hoy.getUTCDay() + 6) % 7)));
  return d.toISOString().slice(0, 10);
})();

function revisar(paso: string, error: { message: string } | null) {
  if (error) throw new Error(`${paso}: ${error.message}`);
}

// 0. Nunca se toca un corredor real: si el id de la demo existe y está activo, se detiene.
const { data: previo } = await db.from("corredores").select("activo").eq("id", ID).maybeSingle();
if (previo?.activo) throw new Error("El corredor de demo aparece activo: no se toca.");

// 1. Corredor de demo desde cero (todo lo suyo se borra en cascada).
revisar("borrar demo", (await db.from("corredores").delete().eq("id", ID)).error);
revisar(
  "corredor",
  (
    await db.from("corredores").insert({
      id: ID,
      slug: "demo",
      nombre: "Deluxe Properties (demo)",
      nombre_contacto: "Patricia",
      activo: false,
      respuesta_automatica: false,
      tono: "Cercana y profesional, de usted, sin emojis.",
      reglas_escalamiento: ["negociación de precio", "comisiones", "ofertas formales", "quejas"],
      marca: { ...MARCA_DELUXE, firma: null },
      zonas_e24: ["san-jose-provincia-escazu", "san-jose-provincia-santa-ana"],
      precio_busqueda_min: 250000,
      precio_busqueda_max: 2000000,
    })
  ).error,
);

// 2. Horario: lunes a viernes, mañana y tarde; sábado en la mañana.
const franjas = [1, 2, 3, 4, 5].flatMap((d) => [
  { corredor_id: ID, dia_semana: d, hora_inicio: "08:00", hora_fin: "12:00" },
  { corredor_id: ID, dia_semana: d, hora_inicio: "13:00", hora_fin: "17:00" },
]);
franjas.push({ corredor_id: ID, dia_semana: 6, hora_inicio: "09:00", hora_fin: "12:00" });
revisar("horario", (await db.from("horarios_visitas").insert(franjas)).error);

// 3. Casas de prueba. Al insertar varias filas, una columna que falta en alguna queda en null (no en su
// valor por defecto): por eso todas llevan `estado`.
const { data: casas, error: eCasas } = await db
  .from("propiedades")
  .insert([
    {
      corredor_id: ID, codigo: "DEMO-01", titulo: "Casa contemporánea con vista al valle", tipo: "casa", operacion: "venta",
      precio: 1250000, zona: "Escazú", provincia: "San José", canton: "Escazú", habitaciones: 4, banos: 4.5,
      m2_construccion: 520, m2_terreno: 1100, amenidades: ["piscina", "vista al valle", "cuarto de servicio", "seguridad 24/7"],
      descripcion: "Casa de líneas limpias en condominio cerrado, con piscina, jardín y vista abierta al Valle Central.",
      estado: "activa",
    },
    {
      corredor_id: ID, codigo: "DEMO-02", titulo: "Apartamento amueblado en torre con amenidades", tipo: "apartamento",
      operacion: "alquiler", precio: 2800, zona: "Santa Ana", provincia: "San José", canton: "Santa Ana", habitaciones: 2,
      banos: 2, m2_construccion: 145, amenidades: ["amueblado", "gimnasio", "piscina", "2 parqueos"],
      descripcion: "Apartamento amueblado con balcón, cerca de centros comerciales y de la ruta 27.",
      estado: "activa",
    },
    {
      corredor_id: ID, codigo: "DEMO-03", titulo: "Lote plano en condominio", tipo: "lote", operacion: "venta",
      precio: 340000, zona: "Ciudad Colón", provincia: "San José", canton: "Mora", m2_terreno: 2400,
      amenidades: ["agua y luz", "acceso controlado"], descripcion: "Lote plano con servicios, listo para construir.",
      estado: "activa",
    },
    {
      corredor_id: ID, codigo: "DEMO-04", titulo: "Casa familiar con jardín", tipo: "casa", operacion: "venta",
      precio: 690000, zona: "Belén", provincia: "Heredia", canton: "Belén", habitaciones: 3, banos: 3, m2_construccion: 310,
      m2_terreno: 600, amenidades: ["jardín", "terraza", "bodega"], estado: "reservada",
      descripcion: "Casa de una planta con jardín amplio, cerca de colegios bilingües.",
    },
  ])
  .select("id, codigo");
revisar("casas", eCasas);
const casa = (codigo: string) => casas!.find((c) => c.codigo === codigo)!.id as string;

// 4. Clientes y chats de prueba (teléfonos 8800-00xx, que no existen).
const { data: clientes, error: eClientes } = await db
  .from("contactos")
  .insert([
    { corredor_id: ID, telefono: "+50688000001", nombre: "Laura Méndez" },
    { corredor_id: ID, telefono: "+50688000002", nombre: "Robert Miller" },
    { corredor_id: ID, telefono: "+50688000003", nombre: "Ana Solís" },
    { corredor_id: ID, telefono: "+50688000004", nombre: null },
  ])
  .select("id, telefono");
revisar("clientes", eClientes);
const cliente = (n: number) => clientes!.find((c) => c.telefono === `+5068800000${n}`)!.id as string;

const { data: chats, error: eChats } = await db
  .from("conversaciones")
  .insert([
    { corredor_id: ID, contacto_id: cliente(1), estado: "abierta", control: "asistente", ultimo_mensaje_cliente_at: hace(14) },
    { corredor_id: ID, contacto_id: cliente(2), estado: "escalada", control: "asistente", ultimo_mensaje_cliente_at: hace(45) },
    { corredor_id: ID, contacto_id: cliente(3), estado: "abierta", control: "asistente", ultimo_mensaje_cliente_at: hace(200) },
    { corredor_id: ID, contacto_id: cliente(4), estado: "abierta", control: "asistente", ultimo_mensaje_cliente_at: hace(1600) },
  ])
  .select("id, contacto_id");
revisar("chats", eChats);
const chat = (n: number) => chats!.find((c) => c.contacto_id === cliente(n))!.id as string;

const entra = (n: number, min: number, contenido: string, intencion: string) => ({
  corredor_id: ID, conversacion_id: chat(n), direccion: "entrante", autor: "cliente", contenido, intencion, created_at: hace(min),
});
const sale = (n: number, min: number, contenido: string, extra: Record<string, unknown> = {}) => ({
  corredor_id: ID, conversacion_id: chat(n), direccion: "saliente", autor: "asistente", contenido,
  estado_entrega: "leido", created_at: hace(min), ...extra,
});
revisar(
  "mensajes",
  (
    await db.from("mensajes").insert([
      entra(1, 16, "Buenas tardes, vi la casa de Escazú con vista al valle. ¿Sigue disponible?", "consulta_propiedad"),
      sale(1, 15, "Buenas tardes, Laura. Sí, la casa contemporánea en Escazú sigue disponible: 4 habitaciones, 520 m² de construcción y piscina. ¿Le gustaría conocerla?"),
      entra(1, 14, "Sí, me encantaría verla esta semana.", "agendar_visita"),
      sale(1, 13, "Con gusto, Laura. Tengo disponible mañana a las 10:00 a. m. o el jueves a las 3:00 p. m. ¿Cuál le queda mejor?", {
        estado_borrador: "pendiente", estado_entrega: null,
      }),
      entra(2, 50, "Hello, I'm interested in the Escazú house. Would the owner accept $1.1M?", "pasar_a_corredor"),
      sale(2, 49, "Thank you, Robert. I'll pass your offer to Patricia, who handles all price conversations. She'll contact you shortly."),
      entra(3, 205, "¿El apartamento de Santa Ana acepta mascotas?", "consulta_propiedad"),
      sale(3, 204, "Hola, Ana. Lo confirmo con Patricia y le aviso en cuanto tenga la respuesta."),
      entra(3, 200, "Perfecto, gracias. ¿Y podría verlo el sábado?", "agendar_visita"),
      sale(3, 198, "Listo, Ana: quedó agendada la visita al apartamento en Santa Ana. Le escribo un día antes para confirmar."),
      entra(4, 1605, "Hola, ¿qué tienen en venta por Belén?", "consulta_propiedad"),
      sale(4, 1603, "Hola, gracias por escribir. En Belén tenemos una casa familiar de 3 habitaciones con jardín, en USD 690.000. ¿Busca para vivir o para invertir?"),
    ])
  ).error,
);

// 5. Visitas agendadas.
revisar(
  "citas",
  (
    await db.from("citas").insert([
      { corredor_id: ID, contacto_id: cliente(3), conversacion_id: chat(3), propiedad_id: casa("DEMO-02"), inicio: horaCR(2, 10), fin: horaCR(2, 11), estado: "confirmada" },
      { corredor_id: ID, contacto_id: cliente(4), conversacion_id: chat(4), propiedad_id: casa("DEMO-04"), inicio: horaCR(3, 15), fin: horaCR(3, 16), estado: "agendada" },
    ])
  ).error,
);

// 6. Dueños directos de la semana (anuncios inventados).
revisar(
  "dueños",
  (
    await db.from("leads_duenos").insert([
      { corredor_id: ID, e24_id: "demo-1", url: "https://www.encuentra24.com/costa-rica-es", titulo: "Vendo casa en Escazú, trato directo", zona: "Escazú", precio: 780000, moneda: "USD", es_dueno: true, puntaje: 86, senales: ["publica una sola propiedad", "texto en primera persona"], semana: lunesCR },
      { corredor_id: ID, e24_id: "demo-2", url: "https://www.encuentra24.com/costa-rica-es", titulo: "Casa en Santa Ana con piscina, dueño", zona: "Santa Ana", precio: 540000, moneda: "USD", es_dueno: true, puntaje: 72, senales: ["dice que es el dueño"], semana: lunesCR },
    ])
  ).error,
);

// 7. Usuario de demo, enlazado solo a este corredor.
const creado = await db.auth.admin.createUser({ email: correo, email_confirm: true });
let usuario = creado.data.user?.id;
if (!usuario) {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  usuario = data.users.find((u) => u.email?.toLowerCase() === correo)?.id;
}
if (!usuario) throw new Error("No se pudo crear ni encontrar el usuario de demo.");
const { data: otros } = await db.from("miembros").select("corredor_id").eq("user_id", usuario).neq("corredor_id", ID);
if (otros?.length) throw new Error("Ese correo ya tiene acceso a un corredor real: usa otro DEMO_CORREO.");
revisar("acceso", (await db.from("miembros").upsert({ corredor_id: ID, user_id: usuario, rol: "corredor" })).error);

console.log(`Demo lista: 4 casas, 4 chats (uno espera respuesta y otro pide hablar con Patricia), 2 visitas y 2 dueños.`);
console.log(`Para que aparezca "Ver la demo" en /entrar, pon DEMO_CORREO=${correo} en Vercel y vuelve a desplegar.`);
