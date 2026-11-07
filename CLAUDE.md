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
  dato (`corredores.marca`, tipo `Marca`); la de Deluxe sigue su Manual de Identidad Visual (4 colores oficiales, Playfair Display
  e Inter, logo oficial en `marcas/deluxe/`). Ejemplo: `npx tsx scripts/ficha-ejemplo.mts <salida.pdf> <fotos...>`.
- Agenda propia en Supabase: horarios, bloqueos y citas en la base; el corredor ve sus citas en el teléfono
  con el enlace ICS `/api/calendario/<token>.ics` o conectando Google.
- Google del corredor (`lib/google/`, Ajustes → Conectar Google, OAuth con `GOOGLE_CLIENT_ID`/`SECRET`; el permiso
  va cifrado con `GOOGLE_TOKEN_KEY` en `google_conexiones`). Cada 15 min (`/api/cron/google`): las visitas van a su
  Google Calendar (con el cliente invitado si tiene correo; Google le manda la invitación), lo ocupado en Google
  bloquea la agenda, los correos de clientes se anotan en el CRM y la respuesta queda como **borrador en Gmail**
  (nunca se manda sola) y a la hora del plan le llega el resumen del día por correo. Del correo solo se guarda
  remitente, asunto y una frase (`correos_procesados`).
- Vercel Cron cada hora para recordatorios, plan del día, vencimiento de anuncios y monitoreo, y cada
  noche para rehacer la demo
  (`vercel.json`, protegido con `CRON_SECRET`).
- Búsqueda de dueños en Encuentra24: Cloudflare frena a los servidores (GitHub Actions, Vercel), así que
  corre en el Chrome del corredor con la **extensión** `extension/` (Manifest V3): el servidor le dice qué
  página abrir (`/api/extension/*`, `lib/encuentra24/extension.ts`), la extensión la abre en una pestaña y
  le manda los scripts con los datos; al final Haiku revisa en segundo plano (`after()`) y la extensión
  consulta el resultado. Se conecta con un código de un solo uso del panel (Más → Dueños directos) que se
  canjea por un permiso; solo se guardan huellas (`extension_conexiones`). `npm run build` la empaca en
  `public/extension/buscador-duenos.zip` con la dirección de `NEXT_PUBLIC_URL_APP`
  (`scripts/empacar-extension.mts`); se instala "descomprimida" (paso a paso en `/panel/duenos/extension`).
  El worker con Playwright (`worker/busqueda-duenos.ts`, `npm run duenos` con Chrome visible) usa el mismo
  recorrido y evaluación (`lib/encuentra24/busqueda.ts`) y queda para soporte;
  `.github/workflows/busqueda-duenos.yml` solo para pruebas a mano.

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
  aviso a los 900. **Los topes frenan, no solo avisan** (`lib/asistente/limites.ts`): al llegar al tope del
  mes, al costo de Claude del día `COSTO_DIARIO_TOPE_USD` o a más de 20 mensajes de un cliente en una hora,
  la IA no se llama y el chat queda para el corredor. Las funciones con IA del panel respetan el tope diario.
- El corredor (rol `authenticated`) solo escribe lo que el panel le deja: ficha de sus propiedades (no las
  fotos), horario, bloqueos, corredores conocidos, leads y algunos ajustes. Mensajes, conversaciones,
  contactos, citas, anuncios y las fotos los escribe el backend tras comprobar con su sesión.
- El servidor solo descarga fotos del bucket `fotos` del propio corredor (`lib/fotos/origen.ts`).
- Registros y alertas: errores con `errorSeguro()` (`lib/monitoreo/errores.ts`, tipo y código, nunca el
  mensaje), nada de datos de clientes en `?aviso=` ni en registros de Actions (el repositorio es público).

## Flujo de un mensaje de WhatsApp
`app/api/whatsapp/webhook/route.ts` verifica la firma de Meta, responde 200 y sigue en `after()` con
`lib/asistente/procesar.ts`: guarda el mensaje (idempotente por `wa_message_id`), suma uso, y si la
conversación no está escalada ni tomada por el corredor, Haiku clasifica y Sonnet responde con las
propiedades activas; si la intención es agendar, `lib/asistente/agenda.ts` calcula horarios libres
(`lib/agenda/disponibilidad.ts`; por zona: traslado estimado entre visitas con `lib/agenda/zonas.ts`, salida desde
`corredores.zona_base` —Patricia, Lindora— y primero los días con otra visita cerca), Sonnet elige la acción con ids cortos y el código arma las fechas y
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
(`lib/fotos/mejorar.ts`) y se las manda para revisar; "ficha <código>" genera la ficha PDF con la
marca del corredor (`corredores.marca`), la sube al bucket público `fichas` y se la manda como documento.

## Panel del corredor (`app/panel`)
Para el teléfono y para alguien que no usa tecnología: **cuatro botones** (Inicio, Clientes, Agenda, Mis casas;
en computadora, menú a la izquierda que se contrae),
letra y botones grandes, palabras de todos los días (nada de "borrador" ni "escalada"), tema claro como
WhatsApp (letra del sistema, verde de WhatsApp para enviar). Inicio (`/panel`): arriba lo
urgente (un botón "Revisar" con lo que espera al corredor), lo que hizo la asistente en 24 horas y "Qué hacer
hoy" (visitas con hora de salida, recordatorios y clientes que no contestan), abajo todos los chats.
**Patty · IA** (`corredores.nombre_asistente`, se cambia en Ajustes): botón flotante en cada página y pantalla propia
(`/panel/patty`, desde Más), con el mismo chat al estilo WhatsApp (`ChatPatty` en `app/panel/patty.tsx`): se
pueden adjuntar hasta 4 fotos (achicadas en el navegador) o PDF, que van a Claude como imagen o documento solo en
ese mensaje (no se guardan; en el navegador queda la miniatura); `lib/panel/patty.ts` arma el contexto
(plan de hoy, visitas de 7 días, clientes, dudas y casas) y `cerebro.conversarConCorredor` (`prompts/patty.md`)
contesta sin escribir en la base ni mandar nada (salvo "bloquear …", que resuelve el código); la conversación vive en el navegador y respeta el tope diario.
Patty sabe en qué pantalla está el corredor (`contextoPantalla`: en la ficha de un cliente, una visita o una casa
lee sus datos y el chat), sugiere preguntas según la pantalla, trae una guía del panel en `prompts/patty.md` y
contesta "¿dónde está…?" con enlaces `[Pantalla](/panel/...)` que se vuelven botones (solo rutas del panel).
Además **lleva al corredor de la mano** (`app/panel/guia.tsx`): al final de la respuesta pide pasos
`<<ir /panel/…>>`, `<<señalar lugar | texto>>`, `<<tocar lugar>>`, `<<escribir lugar | texto>>` sobre elementos con
`data-patty="…"` (catálogo en `prompts/patty.md`); un cursor con su nombre se mueve, resalta y abre pantallas. Solo
hace clic en enlaces y pestañas y solo escribe en campos: nunca guarda, envía ni borra.
Las pantallas principales tienen botones "Pregúntale" (`app/panel/preguntar-patty.tsx`, evento `abrir-patty`).
Agenda en calendario: día, semana, mes o lista (`?vista=`); se toca una hora libre para agendar
(`/panel/agenda/nueva`), cada visita se abre para confirmarla, moverla o cancelarla con aviso al cliente
(`/panel/agenda/visita/<id>`, `lib/panel/visitas.ts`), con color por zona y el traslado entre visitas.
**Bloquear** (`/panel/agenda/bloquear`): un día, mañana, tarde, noche, horas exactas o varios días (uno por día si
son horas), con lista de ratos bloqueados y "Quitar" en la agenda. También por texto, entendido por el código
(`lib/agenda/bloquear.ts`, `lib/agenda/apartar.ts`): "bloquear mañana en la tarde" por WhatsApp del corredor o en el
chat de Patty (sin llamar al modelo; es lo único que Patty escribe en la base). La asistente lo pregunta seguido:
tarjeta diaria "¿Tienes algún compromiso mañana?" en Inicio y Agenda (`app/panel/agenda/pregunta-bloqueo.tsx`, una
vez al día por navegador) y una línea al final del plan del día. Revisar (`/panel/revisar`, `lib/panel/pendientes.ts`) muestra uno a la
vez lo que dijo el cliente y la respuesta propuesta, editable, con Enviar, Yo le escribo y No enviar (o
"Escribirle por WhatsApp" y "Ya lo atendí" si pidió hablar con el corredor) y pasa al siguiente. Lo de
poco uso (Dueños, Anuncios, Probar la asistente, Ajustes, Salir) está detrás de "Más" (`/panel/mas`). Íconos dibujados en `app/panel/iconos.tsx`
(nada de emojis en la navegación); sobre Chats, el número de clientes que esperan. Entrada por enlace
mágico de Supabase Auth (`/entrar`, sin crear usuarios: el acceso lo da `scripts/dar-acceso.mts`), con la
marca del corredor (`lib/panel/marca.ts`): la de `?c=<slug>` o la del único corredor si hay uno solo; el
logo se sirve en `/marca/<slug>/logo`. Después de pedir el enlace, pantalla "Revisa tu correo" y otro
enlace solo pasado un minuto. Con `DEMO_CORREO` aparece además "Ver la demo" (`lib/panel/demo.ts`): entra
sin correo a un corredor **inactivo** con datos ficticios (`lib/panel/demo-datos.ts`: `npm run demo` y el
cron nocturno `/api/cron/demo`, que la deja como nueva cada día), con
una banda que lo dice; la demo no abre si ese usuario fuera miembro de un corredor activo. Un corredor
inactivo nunca manda nada por WhatsApp (`dependenciasPara`, envíos simulados), no presta su marca a la
entrada y en él no se suben ni mejoran fotos. Sin `WHATSAPP_ACCESS_TOKEN` el panel funciona igual y lo
que tenga que salir por WhatsApp falla con su mensaje. `proxy.ts` renueva la sesión. Las páginas leen con la sesión del corredor (`lib/panel/sesion.ts`, RLS). Las acciones
(`app/panel/acciones.ts`) primero comprueban con esa sesión que el mensaje o la conversación son suyos y
luego actúan con el backend (`lib/panel/acciones.ts`): aprobar, corregir o descartar borradores (con su
acción de cita), tomar y devolver control, escribir como el corredor. Cada corrección se guarda en
`correcciones` y las 8 últimas entran como ejemplos de tono en `responder`.
El corredor carga sus datos desde el panel, sin SQL. Una casa nueva se agrega **conversando**
(`app/panel/propiedades/nueva`): cuenta la casa con sus palabras, Claude llena la ficha
(`cerebro.fichaConversada`, `prompts/propiedad.md`), el código (`lib/propiedades/conversar.ts`) pregunta
lo esencial que falte (venta o alquiler, tipo, zona, precio), muestra el resumen, guarda al confirmar y
pide las fotos; el formulario completo queda en `?formulario=1`. En la casa: ficha PDF, anuncio, fotos,
"Ya se vendió" o "Pausarla". Horario (`app/panel/agenda/horario`): Mañana (8–12) y Tarde (1–5) por día,
"¿Un día no puedes?" y, plegado, horas exactas y bloqueos por rango. Corredores conocidos en
`app/panel/duenos/corredores`. Se guardan con su sesión (RLS); los formularios se
leen y validan en `lib/panel/formularios.ts`. Las fotos suben directo del teléfono al bucket `fotos`
(`<corredor>/<propiedad>/originales/…`) con un permiso de subida por archivo (`createSignedUploadUrl`),
achicadas a 2400 px, para no pasar por el límite de tamaño de las funciones de Vercel.
CRM (`app/panel/clientes`, `lib/crm/perfil.ts`): cada cliente tiene etapa (nuevo, interesado, visita,
negociando, cerrado, perdido), lo que busca (`contactos.busca`), notas y seguimiento con fecha. La
asistente llena `busca` con lo que el cliente dice (sale de la misma clasificación de Haiku, sin otra
llamada) y la etapa solo avanza sola (nuevo → interesado → visita al agendar), nunca retrocede ni toca un
cliente cerrado o perdido. Arriba, cifras del embudo (activos, compras en juego, cerrados del mes, a quién llamar); en el teléfono, lista por
etapa; en computadora, tablero donde cada cliente se arrastra de etapa (`app/panel/clientes/tablero.tsx`). Se puede
agregar un cliente a mano y, al perderlo, anotar el motivo (`motivo_perdida`). Cada cliente tiene **Historia**
(`actividades`, `lib/crm/actividades.ts`): lo que anota el corredor (Lo llamé, Le escribí…), cambios de etapa,
ofertas, visitas, correos y los días de WhatsApp; anotar algo reinicia el "sin movimiento" (`ultima_actividad_at`).
"Lo que está en juego": casa que le interesa y oferta (con oferta pasa a Negociando); al cerrar, casa, precio y
comisión (`corredores.comision_pct`, 5% por defecto). Las cifras usan ese dinero real (en negociación, ganado del
mes). Clientes se ve por Todos, Compras o Alquileres (`?tipo=`; los alquileres avisan antes). Dos clientes que son la
misma persona se unen desde la ficha (`unir_contactos`, una sola transacción en la base; se avisa si coinciden
nombre o correo) y las zonas se eligen de una lista (`ZONAS_CONOCIDAS`, `normalizarZona`). "Cómo va el negocio"
(`app/panel/negocio`, desde Más y Clientes): lo ganado mes a mes, hasta dónde llegan los clientes, de dónde vienen,
por qué se pierden y las casas conseguidas con dueños.
Al marcar una visita como hecha queda un recordatorio para mañana; Inicio pide cómo salieron las visitas
pasadas y avisa de casas nuevas que le sirven a algún cliente, y la ficha de cada casa lista a esos clientes. La ficha muestra las
casas que le encajan; el inicio, "Para hoy" (seguimientos que vencen y clientes que no contestan hace 3
días). El corredor edita esos campos con su sesión (permiso por columna; el teléfono no).
Cerebro de la asistente (`app/panel/cerebro`, desde Más): lo que el corredor le enseña (`conocimiento`,
tema y respuesta) entra en `responder` como datos suyos; lo que la asistente no supo (`avisar_corredor`)
queda como duda pendiente (`registrarDuda`, sin repetirse) y al responderla pasa a lo que sabe. Tiene un
mapa interactivo (grafo en SVG con simulación de fuerzas propia, `app/panel/cerebro/mapa.tsx`): la asistente
al centro y cada fuente con sus elementos; se arrastra, se acerca, se filtra por fuente y cada fuente se abre. Muestra
también las correcciones del corredor (antes y después) y de dónde aprende (casas, lo enseñado,
correcciones, horario, tono y temas que van al corredor).
"Probar la asistente" (`app/panel/probar`, desde Chats): el corredor le escribe como si fuera un cliente y
`lib/simulador/simulador.ts` corre `procesarMensaje` real con un repositorio que solo lee propiedades,
agenda y correcciones; la conversación, las citas de prueba y los avisos viven en el estado que guarda el
navegador (`lib/simulador/estado.ts`). Nada se escribe en mensajes, citas ni conversaciones, nada sale por
WhatsApp y no suma al tope; solo se registra el costo de Claude.

## Monitoreo (`lib/monitoreo/`)
Errores (`registrar("error_…")`), fallas del webhook, crons fallidos, mensajes no entregados y costo de
IA del día por encima de `COSTO_DIARIO_ALERTA_USD` llegan como alerta por WhatsApp a `SOPORTE_WHATSAPP`
(plantilla de aviso), una por clave y hora como máximo (`reclamar_alerta`). En serverless, cada ruta
espera las alertas pendientes (`esperarAlertas`). Prueba: `GET /api/monitoreo/prueba` con
`Authorization: Bearer $CRON_SECRET`.

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
Si Encuentra24 bloquea o no trae anuncios, la búsqueda avisa a soporte (extensión) o falla el workflow. Los dueños quedan en
`leads_duenos` y el corredor los ve en el panel (Más → Dueños directos) como embudo de captación: Encontrados, Les
escribí, Respondieron, Visité la casa, Firmaron y Publicadas ("Pasarla a Mis casas" crea la casa con los datos del
anuncio y la enlaza en `leads_duenos.propiedad_id`); si hay WhatsApp
(`WHATSAPP_ACCESS_TOKEN` y números del corredor), además le llega la lista, y si su ventana de 24 horas
está cerrada, queda en `envios_pendientes` y sale cuando escribe. Sin WhatsApp la búsqueda corre igual.
Probar la lectura sin tocar datos: `npm run duenos:prueba -- <zona> [páginas]`. El acceso a datos va por `lib/datos/repositorio.ts`
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
| contactos | Clientes y prospectos, con origen y anuncio que los trajo; CRM: etapa, qué busca, notas y seguimiento |
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
| correcciones | Correcciones del corredor a borradores: ejemplos de tono |
| uso_diario | Mensajes, llamadas y costo de IA por corredor y día |
| alertas | Última vez que se mandó cada alerta de monitoreo (sin ráfagas) |
| actividades | Historia de cada cliente: llamadas, mensajes, visitas, notas, etapas, ofertas y cierre |
| conocimiento | Cerebro de la asistente: lo que el corredor le enseñó y las dudas que no supo contestar |
| extension_conexiones | Extensión de Chrome conectada a un corredor: huellas del código y del permiso, último uso |
| google_conexiones | Gmail y Google Calendar del corredor: permiso cifrado, correo, hasta dónde leyó, resumen enviado |
| correos_procesados | Correos que la asistente revisó: cliente u otro, remitente, asunto, resumen y si dejó borrador |
| busquedas_extension / busquedas_extension_anuncios | Búsqueda de dueños en curso desde la extensión y anuncios leídos (se borran al terminar) |

## Comandos
- `npm run dev` — app local.
- `npm run typecheck` y `npm run build` — antes de cada push.
- `npm test` — pruebas unitarias (vitest) de `tests/`: firma de Meta, parseo del webhook y el flujo
  de la asistente y la agenda con dobles en memoria (`tests/dobles.ts`), disponibilidad, ICS, recordatorios, plan del día, mensajes del corredor, anuncios y búsqueda de dueños
  (`tests/fixtures/e24.ts` arma páginas con la estructura real y datos ficticios).
- `npm run test:db` — crea una base desechable en un Postgres local (usa `PGHOST`, `PGPORT`, `PGUSER`),
  aplica `supabase/tests/shim_supabase.sql`, las migraciones y la semilla, y corre las pruebas SQL de
  `supabase/tests/`. Incluye la prueba de que un corredor no ve datos de otro.
- `SUPABASE_ACCESS_TOKEN=… npx tsx scripts/montar-supabase.mts <ref> [https://dominio]` — monta o pone al
  día el Supabase real por la API de administración (migraciones pendientes, semilla la primera vez, Auth,
  revisión de RLS y buckets; llaves en `.env.local`). Necesita `api.supabase.com` y `*.supabase.co` permitidos.
- `npm run demo` — crea o deja como nueva la cuenta de demo (lee `.env.local`: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_CORREO`).
- `npm run eval:conversaciones` — set de conversaciones (`evals/conversaciones/`): corre cada caso por la
  asistente con Claude real (base y WhatsApp simulados) y califica con código intención, escalamiento,
  agenda, avisos, cifras inventadas y fechas del modelo. Necesita `ANTHROPIC_API_KEY` y cuesta llamadas.
  Hoy son 31 casos sintéticos; se completan con conversaciones reales de Patricia.

## Forma de trabajo
Una rama por entregable, plan antes de código, pruebas de la parte nueva, set de conversaciones,
vista previa de Vercel probada con un número real, y luego unir a la rama principal.
Toda migración nueva va en un archivo nuevo de `supabase/migrations/`; nunca se edita una ya aplicada.
