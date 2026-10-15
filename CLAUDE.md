# Asistente IA para corredores inmobiliarios

## Producto
Asistente por WhatsApp para corredores inmobiliarios: contesta clientes con el tono del corredor,
agenda visitas, manda el plan del día, analiza propiedades y ofertas, vigila los anuncios de
Encuentra24 y busca dueños directos cada semana. Es **multicliente**: Deluxe Properties (Patricia)
es el primer corredor, en el plan USD $299. Sumar otro corredor debe ser cargar datos, no tocar código.

## Stack
- Next.js (App Router, TypeScript) en Vercel, equipo awt1.
- Supabase (Postgres con RLS, Auth). Migraciones en `supabase/migrations/`, semilla en `supabase/seed.sql`.
- WhatsApp Cloud API (Meta): el webhook entra a la app de Next.js.
- API de Claude: Haiku (`claude-haiku-5-5`) para clasificar mensajes y anuncios; Sonnet (`claude-sonnet-5-5`)
  para redactar respuestas, analizar propiedades y ofertas y escribir anuncios.
- API de imágenes de OpenAI (`gpt-image-2`) solo para mejorar fotos de propiedades (`lib/fotos/`).
  Las mejoradas van al bucket público `fotos` de Supabase Storage.
- Ficha de propiedad en PDF con `@react-pdf/renderer` (`lib/fichas/`): la identidad de cada corredor es
  dato (`Marca`); la de Deluxe sigue su Manual de Identidad Visual (4 colores oficiales, Playfair Display
  e Inter, logo oficial en `marcas/deluxe/`). Ejemplo: `npx tsx scripts/ficha-ejemplo.mts <salida.pdf> <fotos...>`.
- Agenda propia en Supabase (no se integra Google Calendar): horarios, bloqueos y citas en la base;
  el corredor ve sus citas en el teléfono suscribiéndose al enlace ICS `/api/calendario/<token>.ics`.
- Vercel Cron cada hora para recordatorios, plan del día y vencimiento de anuncios (`vercel.json`,
  protegido con `CRON_SECRET`).
- Worker de búsqueda de dueños en Encuentra24 con Playwright en GitHub Actions
  (`worker/busqueda-duenos.ts`, `.github/workflows/busqueda-duenos.yml`, lunes temprano).

## Reglas
- **Todo dato lleva `corredor_id`** y la tabla tiene RLS. Las llaves foráneas entre tablas de negocio son
  compuestas `(id, corredor_id)` para que una fila nunca apunte a datos de otro corredor.
- El backend usa `service_role` (salta RLS) desde `lib/supabase/admin.ts`: **cada consulta del backend
  filtra por `corredor_id`** explícitamente. Nunca usar ese cliente en código que corre en el navegador.
- **Ningún secreto en el repositorio.** Variables en `.env.local` y en Vercel; la lista está en `.env.example`.
- Las fechas y horas que ve el cliente las arma el código desde la agenda, nunca el modelo.
- **La asistente nunca inventa datos de una propiedad.** Si no está en `propiedades`, dice que lo confirma
  y le avisa al corredor.
- Lo que está en `corredores.reglas_escalamiento` (negociación de precio, comisiones, ofertas formales,
  quejas) **va al corredor, no al cliente**.
- Mientras `corredores.respuesta_automatica = false` (piloto en sombra), las respuestas quedan como
  borrador (`mensajes.estado_borrador = 'pendiente'`) hasta que el corredor las aprueba.
- Datos personales de clientes y dueños (Ley 8968): nada de teléfonos, nombres ni contenido de mensajes
  en los registros de error.
- El primer mensaje a un dueño directo lo manda el corredor a mano; la asistente nunca escribe en frío.
- Las fotos mejoradas con IA se guardan aparte (`propiedades.fotos[i].mejorada_url`): la original nunca
  se reemplaza y el corredor las revisa antes de publicarlas, porque el modelo regenera la imagen y
  puede cambiar detalles. La instrucción (`prompts/foto.md`) prohíbe agregar, quitar o cambiar nada.
- Cada mensaje entrante y saliente suma en `uso_mensual` vía `registrar_uso()`; tope de 1.000 al mes,
  aviso a los 900.

## Flujo de un mensaje de WhatsApp
`app/api/whatsapp/webhook/route.ts` verifica la firma de Meta, responde 200 y sigue en `after()` con
`lib/asistente/procesar.ts`: guarda el mensaje (idempotente por `wa_message_id`), suma uso, y si la
conversación no está escalada ni tomada por el corredor, Haiku clasifica y Sonnet responde con las
propiedades activas; si la intención es agendar, `lib/asistente/agenda.ts` calcula horarios libres
(`lib/agenda/disponibilidad.ts`), Sonnet elige la acción con ids cortos y el código arma las fechas y
crea la cita. El modelo nunca escribe una fecha que llegue al cliente. Escalamientos, audios/imágenes, fallas de Claude y datos por confirmar se avisan al
corredor con la plantilla `WHATSAPP_PLANTILLA_AVISO`.
Si quien escribe es el propio corredor (`corredores.whatsapp_corredor`), no se trata como cliente:
`lib/asistente/corredor.ts` le entrega su plan pendiente, responde "plan" o le hace un análisis con
Sonnet y `web_fetch` (lee el enlace de Encuentra24). El plan del día lo arma el código
(`lib/asistente/plan.ts`); fuera de la ventana de 24 horas solo puede salir la plantilla de aviso con
un resumen, y el plan completo sale cuando el corredor responde. Otros comandos del corredor:
"anuncio <código>" prepara título y descripción en español e inglés y el orden de fotos
(`lib/anuncios/preparar.ts`) y lo guarda como borrador con su referencia; "reporte" dice qué anuncios
traen contactos (`lib/anuncios/reporte.ts`); "fotos <código>" mejora hasta 12 fotos con OpenAI
(`lib/fotos/mejorar.ts`) y se las manda para revisar.

## Anuncios de Encuentra24
Encuentra24 no tiene API: la asistente prepara y vigila, el corredor publica. Cada anuncio tiene una
`referencia` que va en el enlace wa.me de la descripción; el primer mensaje del cliente la trae y
`atribuirContacto` enlaza el contacto al anuncio. Un anuncio nace como `borrador` (sin `e24_id` ni `url`)
y pasa a `activo` cuando la lectura del perfil lo encuentra publicado.

Lectura del sitio: las páginas son una app Next.js y cada anuncio viene como JSON en el payload de
React Server Components; `lib/encuentra24/parsear.ts` lee ese JSON (no clases CSS). El campo
`advertiserType` dice "Agente" o "Propietario". Paginación: `?page=N`. El sitio está detrás de
Cloudflare: hace falta un navegador real (`worker/navegador.ts`), volumen bajo y pausas.
`lib/encuentra24/busqueda.ts` recorre las zonas (`corredores.zonas_e24`, slugs de la URL) por turnos,
descarta agentes, ya vistos, fuera de rango y corredores bloqueados, y Haiku confirma dueño o corredor.
Si Encuentra24 bloquea o no trae anuncios, el workflow falla (GitHub avisa). La lista llega al corredor
por WhatsApp; si su ventana de 24 horas está cerrada, queda en `envios_pendientes` y sale cuando escribe.
Probar la lectura sin tocar datos: `npx tsx worker/busqueda-duenos.ts --prueba <zona> [páginas]`. El acceso a datos va por `lib/datos/repositorio.ts`
y Claude por `lib/asistente/cerebro.ts`; ambos son interfaces para poder probar con dobles.

## Instrucciones del agente
Versionadas en `prompts/`, una por tarea: clasificar, responder, agendar, analizar, anuncio,
dueño o corredor. Un cambio de tono o de instrucciones se prueba con el set de conversaciones antes de unirse.

## Datos
| Tabla | Qué guarda |
|---|---|
| corredores | Datos del corredor, números de WhatsApp, zonas, tono, escalamiento, plan y topes |
| miembros | Qué usuario de Supabase Auth ve qué corredor (Patricia y soporte) |
| propiedades | Propiedades activas: ficha, precio, zona, fotos, enlace de Encuentra24 |
| contactos | Clientes y prospectos, con origen y anuncio que los trajo |
| conversaciones / mensajes | Historial de WhatsApp, quién respondió, intención, borradores |
| citas | Visitas agendadas; una restricción de exclusión impide citas encimadas |
| horarios_visitas | Franjas semanales en que el corredor acepta visitas |
| bloqueos_agenda | Excepciones a la agenda (vacaciones, compromisos) |
| anuncios_e24 | Anuncios (borrador o publicados), texto preparado, vencimiento y referencia para atribuir contactos |
| leads_duenos | Búsqueda semanal: puntaje, señales, estado de contacto |
| corredores_bloqueados | Corredores conocidos que no se captan como dueños (nombre, teléfono o cuenta de Encuentra24) |
| envios_pendientes | Mensajes largos para el corredor que esperan a que abra la ventana de 24 horas |
| uso_mensual | Mensajes, llamadas a Claude y costo por corredor y mes |
| planes_dia | Plan del día generado por corredor y fecha, y si ya se entregó |

## Comandos
- `npm run dev` — app local.
- `npm run typecheck` y `npm run build` — antes de cada push.
- `npm test` — pruebas unitarias (vitest) de `tests/`: firma de Meta, parseo del webhook y el flujo
  de la asistente y la agenda con dobles en memoria (`tests/dobles.ts`), disponibilidad, ICS, recordatorios, plan del día, mensajes del corredor, anuncios y búsqueda de dueños
  (`tests/fixtures/e24.ts` arma páginas con la estructura real y datos ficticios).
- `npm run test:db` — crea una base desechable en un Postgres local (usa `PGHOST`, `PGPORT`, `PGUSER`),
  aplica `supabase/tests/shim_supabase.sql`, las migraciones y la semilla, y corre las pruebas SQL de
  `supabase/tests/`. Incluye la prueba de que un corredor no ve datos de otro.
- Set de conversaciones de prueba: pendiente (semana 1, con las conversaciones reales de Patricia).

## Forma de trabajo
Una rama por entregable, plan antes de código, pruebas de la parte nueva, set de conversaciones,
vista previa de Vercel probada con un número real, y luego unir a la rama principal.
Toda migración nueva va en un archivo nuevo de `supabase/migrations/`; nunca se edita una ya aplicada.
