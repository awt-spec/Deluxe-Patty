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
- API de imágenes de OpenAI (`gpt-image-2`, `lib/fotos/editor.ts`): mejorar fotos, **amueblar** cuartos vacíos y
  **quitar objetos** (`lib/fotos/variantes.ts`, en cada foto de la casa: "Con IA") e imágenes desde el chat de Patty
  ("hazme una imagen de…" o, con foto adjunta, "amuebla esta sala"; `lib/panel/imagenes-patty.ts`). Todo va al
  bucket público `fotos`; cada llamada estima su costo por el uso que informa OpenAI y suma en `uso_diario` /
  `uso_mensual` (`registrar_imagenes`). **Imagen para redes** (`/panel/propiedades/<id>/redes`, `lib/redes/`): post
  cuadrado e historia con foto, precio, datos y la marca del corredor, armada por código con `next/og` (sin IA,
  sin cifras inventadas), y el texto para copiar.
  Esa pantalla es un **estudio** con tres pestañas (`?ver=imagen|video|texto`): Imagen (se elige la foto; "Mejorar esta
  foto con IA" usa `mejorarFotos(…, soloUrl)`), Texto editable con IA (`mejorarTextoRedes`, `cerebro.textoRedes`,
  `prompts/redes-texto.md`) y **Video**, que se arma en el navegador con canvas + MediaRecorder (`dibujo.ts`,
  `lib/redes/video.ts`) con las fotos reales: portada, fotos (zoom lento y fundido), datos y cierre con la marca; 9:16 o
  1:1, hasta 45 s; prefiere MP4 H.264 y si no cae a WebM. Tiene 3 estilos (Elegante, Moderno, Limpio; reglas puras en
  `lib/redes/estilo-video.ts`: foto por proporción —llena, paneo o completa sobre su fondo desenfocado—, transiciones,
  zonas seguras 14 %/20 %), datos con íconos y cifras de la ficha, y música opcional del corredor (archivo propio,
  mezclado en el teléfono; no se sube ni se guarda). La IA solo propone el guion (`proponerGuionVideo`,
  `prompts/redes-video.md`: orden de fotos por id y textos de hasta 60 caracteres); precio y datos los escribe el código.
  `lib/redes/cifras.ts` descarta lo que traiga cifras fuera de la ficha y repone precio, código y contacto; en la demo la
  respuesta es simulada. Las fotos para el canvas se cargan con CORS y, si no, por `redes/foto?img=` (solo fotos de esa casa).
  **"Pídeselo a …"** en las tres pestañas (`redes/chat.tsx`, `lib/redes/chat.ts`, `prompts/redes-chat.md`): el corredor pide con
  sus palabras y el modelo (`chatRedes`, `textoRedesPedido`) devuelve operaciones que el código valida y aplica, con Deshacer.
  Video: mover, portada, quitar, agregar, texto, duración de escena o total, estilo, formato y datos. Imagen: elegir, mejorar,
  quitar cosas sueltas o amueblar, siempre como variante ilustrativa y con "¿Hacerlo?" antes de gastar; `vetoImagen` niega antes
  de llamar a Claude o a OpenAI lo que cambia la casa o tapa daños. Texto: solo se aceptan las cifras que el corredor escribió
  en su pedido (`conCifrasDichas`). Hasta 6 pedidos por minuto, pedido de máximo 500 caracteres tratado como dato; en la demo
  lo entiende el código (`interpretarDemo`) sin gastar.
- Ficha de propiedad en PDF con `@react-pdf/renderer` (`lib/fichas/`; A4 tipo folleto: portada, datos, galería y contacto con QR;
  piezas en `piezas-pdf.tsx` y reglas en `diseno.ts` —`reticulaGaleria`, `anchosColumnas`, `cifrasClave`—; sin marca sale
  `marcaNeutra`; el PDF de Patty usa las mismas piezas, con portada completa si pasa de 2 páginas y tablas que repiten su cabecera;
  en react-pdf, nada de `lineHeight` en `Page` porque borra el pie fijo): la identidad de cada corredor es
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
  consulta el resultado. **Busca sola cada semana**: `chrome.alarms` despierta cada ~6 h (y al abrir Chrome) y
  pregunta `GET /api/extension/programa` (`programaBusqueda`): toca si la última búsqueda terminada (marca
  `busqueda_hecha:<corredor>` en `alertas`, o el último `leads_duenos.created_at`) tiene más de 7 días, y el turno se
  reserva 6 h con `reclamar_alerta('busqueda_auto:<corredor>')`; corre en una pestaña de fondo, y si Cloudflare pide
  verificar se cancela en silencio (sin aviso a soporte) y se reintenta. Se apaga en el popup ("Buscar dueños sola
  cada semana", `chrome.storage`). **Leer este anuncio** (popup, en la página de un anuncio): la extensión manda
  dirección, título, texto, JSON-LD, enlaces wa.me y fotos a `POST /api/extension/anuncio` (`lib/encuentra24/anuncio.ts`);
  si trae la referencia de un `anuncios_e24` del corredor, lo pasa a `activo` (url, `e24_id`, `publicado_en` si
  faltaba) y llena `propiedades.url_e24`; si no, arma la ficha con `conversarFicha` (el texto va como dato, nunca
  como instrucciones), no duplica por `url_e24` ni guarda si falta lo esencial, y la guarda **pausada** (`inactiva`)
  con las fotos copiadas solo desde `*.encuentra24.com` (`lib/fotos/copiar.ts`). Frenos: una lectura cada 10 s por
  corredor y el mismo anuncio una vez por minuto (`alertas`). Se conecta con un código de un solo uso del panel que se canjea por un permiso; solo se guardan huellas
  (`extension_conexiones`). Desde la versión 1.2.0 se **conecta sola**: un content script (`extension/canal.js` +
  `panel.js`, solo en `<APP>/panel/duenos*`, ventana principal) le dice a la página que está instalada y su versión, y la
  página le pasa por `postMessage` (mismo origen y ventana, `lib/panel/extension-instalar.ts`) un código recién pedido con
  `pedirCodigoExtension`; el background lo canjea en `/api/extension/conectar` y a la página solo vuelve "conectada a
  <corredor>", nunca el permiso. Al instalarla o actualizarla se inyecta en la pestaña del panel ya abierta. `npm run build`
  la empaca en `public/extension/buscador-duenos.zip` con la dirección de `NEXT_PUBLIC_URL_APP` (en `config.js`, `panel.js` y
  el manifiesto; `scripts/empacar-extension.mts`); la versión que espera el panel sale de `extension/manifest.json`. Se
  instala "descomprimida" con un asistente paso a paso en `/panel/duenos/extension` (`app/panel/duenos/extension/`: un
  paso por pantalla con dibujos SVG de Chrome, avanza solo al ver la extensión, recuerda el paso en el navegador, mini
  asistente para actualizar una versión anterior; en teléfono o Safari/Firefox solo manda el enlace) y su estado se ve en
  Dueños directos (`estado-extension.tsx`); el código a mano queda de respaldo.
  Desde la 1.3.0 **busca a ritmo de persona** (`extension/ritmo.js`: 8–25 s por página, pausas de 6–20 s, descanso de 45–120 s
  cada 4–6 páginas, 12 páginas por búsqueda y 24 por día, una sola pestaña) y **sin tocar la identidad del navegador** (hay una
  prueba que lo vigila). A la vista, `control.js` (Shadow DOM cerrado) pone marco, barra y un cursor dibujado con
  `nombre_asistente`; si la persona usa la pestaña, se pausa. Se pausa o detiene desde la barra, el popup y el panel
  (`busqueda-en-vivo.tsx`, canal "busqueda"; estados en `maquina.js`, pedidos válidos en `mensajes.js`); `/api/extension/detener`
  guarda lo ya leído y una búsqueda detenida no cuenta como la semanal. Verificación de Cloudflare, captcha o 403/429: a la vista
  se detiene y pide "Seguir" (nunca se salta); de fondo se cancela. Prueba real: `npx tsx scripts/probar-buscador.mts <capturas>`.
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
  Quien escribe «Privacidad…» por WhatsApp (lo que dice `/privacidad`) pasa directo al corredor, sin modelo, con
  cinco días hábiles para responder.
- El primer mensaje a un dueño directo lo manda el corredor a mano; la asistente nunca escribe en frío.
- Las fotos mejoradas con IA se guardan aparte (`propiedades.fotos[i].mejorada_url`): la original nunca
  se reemplaza y el corredor las revisa antes de publicarlas, porque el modelo regenera la imagen y
  puede cambiar detalles. La instrucción (`prompts/foto.md`) prohíbe agregar, quitar o cambiar nada.
  Las amuebladas o limpias van en `fotos[i].variantes` y se muestran como **ilustrativas** (la imagen para
  redes lo escribe sobre la foto); `prompts/foto-limpiar.md` prohíbe tapar daños o defectos.
- Cada mensaje entrante y saliente suma en `uso_mensual` vía `registrar_uso()`; tope de 1.000 al mes,
  aviso a los 900. **Los topes frenan, no solo avisan** (`lib/asistente/limites.ts`): al llegar al tope de
  mensajes del mes, al **tope de gasto de IA del día o del mes** (Claude + imágenes, `presupuesto_ia()`) o a más de
  20 mensajes de un cliente en una hora, la IA no se llama y el chat queda para el corredor. Las funciones con IA del
  panel respetan los mismos topes. Los topes de gasto los define el **superadministrador** (`/admin`, `app/admin`,
  `lib/admin/superadmin.ts`; quién lo es: tabla `superadmins`, por correo): los de la plataforma (`plataforma`) y,
  si hace falta, uno propio por corredor (`corredores.tope_ia_dia_usd` / `tope_ia_mes_usd`, vacío = plataforma, 0 =
  apagado) y si puede usar imágenes (`imagenes_activas`). El corredor no los puede leer ni cambiar fuera de su fila.
  `/admin` tiene cinco secciones (menú lateral; en el teléfono, pestañas): **Resumen** (cifras, "Atención" con lo
  que falta o se pasa, alertas), **Corredores** (y `/admin/corredores/<id>`: Phone number ID, número de la asistente,
  celular del corredor, activo, respuesta automática, topes, accesos y "Probar WhatsApp"), **WhatsApp** (diagnóstico
  en vivo con la Graph API, `lib/whatsapp/graph.ts`: llaves puestas, estado de cada número, **registrar el número**
  con PIN —error 133010—, **suscribir la app** a la cuenta y **conectar el webhook**), **Accesos** (crear usuarios con
  contraseña, enlazar a un corredor, superadmins; nunca se quita el último ni a uno mismo) e **IA y topes**. Las
  acciones (`app/admin/acciones.ts`) vuelven a comprobar al superadmin y no registran correos, teléfonos ni
  contraseñas. El resultado de cada acción sale pegado arriba (`?m=&ok=`). `explicarErrorWhatsApp` traduce los
  códigos de Meta (190, 133010, 131030, 131042, 132001…).
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

## Multimedia (notas de voz, fotos, PDF, Word, Excel y video)
- **Por WhatsApp** (`lib/asistente/medios.ts`, `lib/whatsapp/media.ts`): el webhook trae el id del archivo
  (`MensajeEntrante.media`); se baja de Meta solo de sus dominios y con la llave (nunca se guarda en disco). La **nota
  de voz** se transcribe con OpenAI (`lib/medios/transcribir.ts`, `whisper-1`, `OPENAI_API_KEY`) y sigue el flujo como
  si fuera texto, también la de un **cliente** ("Nota de voz: …" queda en el mensaje). Una **foto o PDF de Patricia**
  se analiza con Claude (`cerebro.analizar` con `adjuntos`); la de un **cliente** la describe Haiku
  (`cerebro.describirMedio`, `prompts/describir-medio.md`) y la descripción entra como texto. Video, Word y Excel por
  WhatsApp no se leen (se le dice a Patricia que los suba al panel; el cliente queda para el corredor). Sin la llave de
  WhatsApp u OpenAI, con el tope de gasto alcanzado o con un archivo muy grande (audio 8 MB, foto 5 MB, PDF 10 MB), se
  cae al aviso de antes. El contenido de los archivos nunca va a los registros.
- **En el chat de Patty** (`app/panel/patty.tsx`): clip (fotos, PDF, Word `.docx`, Excel `.xlsx`, `.txt`/`.csv`, video),
  cámara, pegar o arrastrar, hasta 10 archivos y 4 MB; micrófono: se graba en el teléfono, `transcribirNota` lo pasa a
  texto y queda en la caja para revisarlo antes de enviar. Word/Excel/texto se convierten a texto en el servidor
  (`lib/medios/documentos.ts`, `mammoth` y `read-excel-file`) y van a Claude como datos en `<archivo>`, nunca como
  instrucciones. El **video** no se manda: el teléfono saca 6 fotogramas repartidos (máx. 5 minutos) que viajan como
  fotos en orden.
- **Gasto:** la transcripción suma en `uso_diario` / `uso_mensual` (`segundos_audio`, `costo_audio_usd`,
  `registrar_audio`) y cuenta para el tope de IA (`presupuesto_ia()`). El corredor inactivo (demo) no transcribe de verdad.

## Panel del corredor (`app/panel`)
Para el teléfono y para alguien que no usa tecnología: una barra de abajo con **cinco lugares**, la asistente al centro
(Inicio, Clientes, [Patty en círculo verde, `data-patty="nav-preguntar"`, abre el chat con `abrir-patty`], Agenda, Mis casas; ya no
hay botón flotante; la barra mide `--nav-alto` y el círculo sobresale `--nav-saliente`: el contenido deja `--nav-alto` + 16 px y
las barras fijas se apoyan en `calc(var(--nav-alto) + var(--nav-saliente))`; cada pantalla trae su CSS de teléfono —`agenda-movil.css`,
`cerebro.css`, `redes.css`, `ficha.css`, `propiedades/formulario-movil.css`—; en la agenda la semana muestra 3 días y abre en hoy y el
mes muestra puntos con la lista del día debajo (`agenda/movil.tsx`, `lib/panel/movil.ts`); en la ficha del cliente y los formularios de
casa lo secundario va plegado con su resumen y la guía de Patty abre lo plegado antes de señalarlo;
en computadora, menú a la izquierda claro al estilo WhatsApp Web (`app/panel/menu-lateral.tsx`; paleta fija `PALETA_MENU` en
`lib/panel/colores-menu.ts` = variables `--m-*` de globals.css, AA probado; de la marca solo va el logo en círculo), 264 px o
riel de 72 px, "Pregúntale a Patty" en píldora verde, grupos Tu día / Tu negocio / Tu asistente, burbujas verdes de pendientes
y la cuenta abajo con Ajustes y Salir; atajos `lib/panel/atajos.ts`: g + i/c/a/m, y `/` o Ctrl/⌘+K abre Patty),
letra y botones grandes, palabras de todos los días (nada de "borrador" ni "escalada"), tema claro como
WhatsApp (letra del sistema, verde de WhatsApp para enviar). Inicio (`/panel`): arriba lo
urgente (un botón "Revisar" con lo que espera al corredor), lo que hizo la asistente en 24 horas y "Qué hacer
hoy" (visitas con hora de salida, recordatorios y clientes que no contestan), abajo todos los chats.
**Patty · IA** (`corredores.nombre_asistente`, se cambia en Ajustes): botón flotante en cada página y pantalla propia
(`/panel/patty`, desde Más), con el mismo chat al estilo WhatsApp (`ChatPatty` en `app/panel/patty.tsx`): se
pueden adjuntar hasta 4 fotos (achicadas en el navegador) o PDF, que van a Claude como imagen o documento solo en
ese mensaje (no se guardan; en el navegador queda la miniatura); `lib/panel/patty.ts` arma el contexto
(plan de hoy, visitas de 7 días, clientes, dudas y casas) y `cerebro.conversarConCorredor` (`prompts/patty.md`)
contesta sin escribir en la base ni mandar nada, salvo dos cosas que resuelve el código: "bloquear …" y **cargar una
casa** («agrega esta casa: …», `pideCargarCasa` en `lib/panel/casa-patty.ts`): el chat sigue la misma conversación de
Agregar casa (`conversarCasa`, mismo tope y demo), pregunta lo esencial que falte, muestra la tarjeta "Así quedó. ¿Está
bien?" con "Sí, guardarla" / "Cambiar algo" y **solo guarda al confirmar** (`guardarCasaConversada`); las fotos adjuntas
se guardan en memoria en el original y, al guardar, suben a 2400 px a la casa (`app/panel/patty-casa.ts`, `pedirSubidas`
+ `registrarFotos`). La conversación y la casa en curso viven en el navegador y respetan el tope diario. Cada respuesta
se guarda en el navegador antes de guiar (la guía puede cerrar el chat o salir de `/panel/patty`); desde esa pantalla la
guía la corre el botón flotante del layout (evento `guiar-patty`) y, si el chat quedó fuera de la vista, la respuesta
sale en un globo con "Ver en el chat".
Sus respuestas se muestran ordenadas (`app/panel/patty-contenido.tsx`, lector propio `lib/panel/markdown.ts`, sin HTML):
títulos, listas, tablas, citas y **diagramas** (bloques ```mermaid dibujados en el navegador con `mermaid`, modo estricto).
Cada respuesta larga tiene Copiar y "Hacer PDF"; si el corredor pide un documento, Patty termina con `<<pdf Título>>`
y aparece la tarjeta del PDF. El PDF lo arma el servidor sin IA (`pdfDePatty`, `lib/panel/pdf-patty.tsx`,
`@react-pdf/renderer`) con la marca del corredor y los diagramas que el navegador pasa a PNG; se ve en un visor y se
descarga, y no se guarda. También en **PNG**: "Hacer imagen" (o `<<png Título>>` cuando la pide) arma en el navegador una
lámina con la marca del corredor (`laminaPng`, `html-to-image`, `marcaParaLamina`), y cada diagrama se baja en PNG. Un pedido
de imagen con sus datos (resumen, tabla, diagrama, infografía, PNG) no va a la IA de imágenes (`pideImagen`).
Favicon: `app/icon.svg` y `app/apple-icon.tsx`.
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
**Apartar tiempo** (antes "Bloquear"; la ruta `/panel/agenda/bloquear` y las tablas no cambian, y el comando entiende "apartar…" y "bloquear…"): el día en chips (Hoy, Mañana, la semana) u otro día, mañana, tarde, noche,
horas exactas o varios días (uno por día si son horas), y abajo lo ya bloqueado con "Quitar" (también en la agenda). También por texto, entendido por el código
(`lib/agenda/bloquear.ts`, `lib/agenda/apartar.ts`): "bloquear mañana en la tarde" por WhatsApp del corredor o en el
chat de Patty (sin llamar al modelo; es lo único que Patty escribe en la base). La asistente lo pregunta seguido:
**con sus palabras** ("Cuéntame cuándo no puedes"): el código primero (`codigoLoEntiende`) y, si no alcanza, Haiku
(`entenderApartado`, `prompts/apartar.md`) devuelve operaciones que `revisarOperaciones` (`lib/agenda/apartar-ia.ts`) valida y
formatea; la pantalla siempre muestra "Esto entendí" (con choques con visitas) y Deshacer, Patty enlaza la propuesta sin guardar y
WhatsApp guarda directo solo sin dudas ni choques; demo sin gasto y 6 pedidos por minuto;
tarjeta diaria "¿Tienes algún compromiso mañana?" en Inicio y Agenda (`app/panel/agenda/pregunta-bloqueo.tsx`, una
vez al día por navegador) y una línea al final del plan del día. Revisar (`/panel/revisar`, `lib/panel/pendientes.ts`) muestra uno a la
vez lo que dijo el cliente y la respuesta propuesta, editable, con Enviar, Prefiero escribirle yo y No enviar (o
"Escribirle por WhatsApp" y "Ya lo atendí" si pidió hablar con el corredor) y pasa al siguiente. Lo de
poco uso (Dueños, Anuncios, Probar la asistente, Ajustes, Salir) está detrás de "Más" (`/panel/mas`). Íconos dibujados en `app/panel/iconos.tsx`
(nada de emojis en la navegación); sobre Chats, el número de clientes que esperan. Entrada con correo y contraseña o por enlace
mágico de Supabase Auth (`/entrar`, sin crear usuarios desde ahí: el acceso lo da `/admin` → Accesos o `scripts/dar-acceso.mts`), con la
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
etapa; en computadora, tablero donde cada cliente se arrastra de etapa (`app/panel/clientes/tablero.tsx`; al soltar en Cerró pide precio, moneda y comisión con `cerrarDesdeTablero`). Se puede
agregar un cliente a mano y, al perderlo, anotar el motivo (`motivo_perdida`). Cada cliente tiene **Historia**
(`actividades`, `lib/crm/actividades.ts`): lo que anota el corredor (Lo llamé, Le escribí…), cambios de etapa,
ofertas, visitas, correos y los días de WhatsApp; anotar algo reinicia el "sin movimiento" (`ultima_actividad_at`).
"Lo que está en juego": casa que le interesa y oferta (con oferta pasa a Negociando); al cerrar, casa, precio y
comisión (`corredores.comision_pct`, 5% por defecto, en ventas; en alquileres se estima un mes de renta). La oferta y el
cierre llevan su moneda (`oferta_moneda`, `cierre_moneda`: dólares o colones) y **dólares y colones nunca se suman**
(`lib/crm/dinero.ts`). Las cifras usan ese dinero real (en negociación, ganado del mes). Clientes se ve por Todos, Compras o Alquileres (`?tipo=`; los alquileres avisan antes). Dos clientes que son la
misma persona se unen desde la ficha (`unir_contactos`, una sola transacción en la base; se avisa si coinciden
nombre o correo) y las zonas se eligen de una lista (`ZONAS_CONOCIDAS`, `normalizarZona`). Zonas
(`lib/agenda/zonas.ts`): cada una con cantón, distrito y nivel; traslado de ciudad hasta 20 km y de carretera después; una
casa lejana se ofrece en la última hora de cada franja. `resolverZona` (`lib/sitio/ubicacion.ts`, la usa la importación
del sitio): el barrio dentro de su distrito gana; contradicción, nombre ambiguo o zona genérica → **ubicación por
confirmar**, que vive en `conocimiento` (tema `Ubicación <código>: …`: pendiente, activa —la `respuesta` manda sobre el
sitio— o archivada) y se contesta en Mis casas y en la ficha (`confirmarUbicacion`). En Mis casas las pausadas van
siempre al final, en "Pausadas (N)" (`lib/panel/orden-casas.ts`). La ficha del cliente (`app/panel/clientes/[id]/vista.tsx`)
abre con **Qué sigue**, una recomendación armada por código (`que-sigue.ts`). "Cómo va el negocio"
(`app/panel/negocio`, desde Más y Clientes): lo ganado mes a mes, hasta dónde llegan los clientes, de dónde vienen,
por qué se pierden y las casas conseguidas con dueños.
Al marcar una visita como hecha queda un recordatorio para mañana; Inicio pide cómo salieron las visitas
pasadas y avisa de casas nuevas que le sirven a algún cliente, y la ficha de cada casa lista a esos clientes. La ficha muestra las
casas que le encajan; el inicio, "Para hoy" (seguimientos que vencen y clientes que no contestan hace 3
días). El corredor edita esos campos con su sesión (permiso por columna; el teléfono no).
Cerebro de IA (`app/panel/cerebro`, nombre en `NOMBRE_CEREBRO`; tablero de la asistente con "N de 7 listos" → `/panel/empezar`
y tres secciones `?ver=necesita|sabe|contesta`, más `mapa`; los viejos `dudas|errores|fuentes` llevan a su lugar con `vistaCerebro`.
Lo que necesita de ti: preguntas, "¿Dónde queda esta casa?" y lo que falta. Lo que sabe: "Enséñale algo" y grupos plegables por
fuente. Cómo contesta: tono, temas que le pasa, si contesta sola, correcciones —las 8 en uso marcadas— y "Probarla"; reglas puras
en `resumen.ts`, `listaPreparacion`): lo que el corredor le enseña (`conocimiento`,
tema y respuesta) entra en `responder` como datos suyos; lo que la asistente no supo (`avisar_corredor`)
queda como duda pendiente (`registrarDuda`, sin repetirse) y al responderla pasa a lo que sabe. Tiene un
mapa interactivo (grafo en SVG con simulación de fuerzas propia, `app/panel/cerebro/mapa.tsx`): la asistente
al centro y cada fuente con sus elementos; se arrastra, se acerca, se filtra por fuente y cada fuente se abre. Muestra
también las correcciones del corredor (antes y después) y de dónde aprende (casas, lo enseñado,
correcciones, horario, tono y temas que van al corredor).
**Guías paso a paso** (`app/panel/pasos/`, reglas en `lib/panel/pasos.ts`, clases `pap-*`): un paso por pantalla, recuerdan el paso
en el navegador, avanzan solas cuando los datos lo dicen y respetan el "Atrás". Puesta en marcha (`/panel/empezar`,
`lib/panel/puesta.ts`: 6 pasos con las reglas de `listaPreparacion`; tarjeta en Inicio y entrada en Más mientras falten los 5
obligatorios, Google es opcional); `/panel/empezar/sola` (aprobadas, corregidas y descartadas de 30 días y el interruptor;
`guardarAjustes` acepta `solo` y `volver` de una lista fija); `/panel/agenda/calendario` (ICS por aparato);
`/panel/anuncios/<id>/publicar` (copiar, publicar, leer con la extensión; pasa a Listo sola cuando deja de ser borrador) y
`/panel/propiedades/<id>/redes/subir`. En el chat con un cliente la barra de abajo se oculta y la asistente queda en la cabecera.
"Probar la asistente" (`app/panel/probar`, desde Chats): el corredor le escribe como si fuera un cliente y
`lib/simulador/simulador.ts` corre `procesarMensaje` real con un repositorio que solo lee propiedades,
agenda y correcciones; la conversación, las citas de prueba, los avisos, las calificaciones y la nota viven en el estado del
navegador (`lib/simulador/estado.ts`) y se guardan en `localStorage` por corredor durante 24 h (`lib/simulador/guardado.ts`). Nada se escribe en mensajes, citas ni conversaciones, nada sale por
WhatsApp y no suma al tope; solo se registra el costo de Claude.
Cada respuesta de la prueba se **califica** (pulgares): "No me gustó" → `calificarRespuesta` (`app/panel/probar/calificar.ts`,
reglas en `lib/simulador/calificar.ts`, `queGuardar`): la versión del corredor va a `correcciones` (con un `mensaje_id` propio de
esa respuesta de prueba), un dato a `conocimiento` (`ensenarAlCerebro`) o, sin texto, queda como duda (`registrarDuda`);
"debió pasármelo" solo lleva a Ajustes. El resumen (bien / por mejorar, nota de 1 a 5) vive en el navegador.

## Sitio web del corredor (`lib/sitio/publico.ts`, `app/api/sitio/<slug>/…`)
El sitio público del corredor (el de Deluxe está hecho en Lovable) usa el portal como fuente de verdad, por tres
direcciones públicas con CORS abierto (los datos son públicos) y el corredor identificado por `corredores.slug`:
- `GET casas`: casas activas con fotos, solo campos publicables (nunca notas, comisiones ni clientes), fotos originales
  en orden y `whatsapp` (wa.me a la asistente con la referencia: "me interesa la propiedad DP-01… que vi en su sitio web").
  Una casa vendida o pausada sale del sitio sola (caché de 60 s).
- `GET horarios?casa=<id>`: horas libres de la agenda real (`horariosLibres`: horario, bloqueos, visitas y traslado a
  la zona de la casa), agrupadas por día.
- `POST visita` (JSON `{casa, inicio, nombre, telefono, correo, notas, acepta, empresa}`): valida (`leerPedido`; `empresa`
  es trampa para robots y `acepta` el aviso de privacidad), frena ráfagas por conexión y por teléfono (`reclamar_alerta`
  con huellas, sin guardar IP ni número), vuelve a comprobar que la hora sigue libre, crea o encuentra el cliente,
  la visita "por confirmar" (`crearVisita`, sin escribirle al cliente), anota en la Historia que vino del sitio y le avisa
  al corredor con la plantilla. El cliente queda con origen `whatsapp` (no hay origen "sitio" en la base todavía).
- **Importación cada 10 minutos** (`lib/sitio/importar.ts`, cron `/api/cron/sitio`; solo escribe lo que cambió): lee la exportación JSON del sitio
  (`fuentesSitio()`: Deluxe → función `exportar-propiedades` de su Supabase; otras con `SITIO_FUENTES`) y crea o pone al
  día cada casa por su código del sitio (`DP-XXXXXX`, el sitio manda en esas casas: los destacados van en la descripción),
  copia las fotos al bucket propio (solo del servidor de la exportación, 80 por vuelta, `fotos[i].fuente`) y quita las que
  allá ya no están; vendida allá → vendida/alquilada; oculta o desaparecida → pausada; borra las de ejemplo (`EJEMPLO-*`).
  Las casas hechas en el portal no se tocan, y las importadas no se devuelven al sitio en `GET casas`.
- **Modo corredor** (`lib/sitio/modo-corredor.ts`, botón en la ficha de la casa): enlace `<sitio>/share/<slug>` de la casa sin los
  datos de contacto del corredor, para pasarlo a otro corredor. Solo en casas del sitio (`DP-XXXXXX`, activas); el slug se lee de
  la exportación (caché de 5 min) y la dirección del sitio sale de `sitiosWeb()` (`SITIO_URLS`).

## Monitoreo (`lib/monitoreo/`)
Cada llamada a Claude deja una traza `llamada_claude` (modelo, ms, tokens, caché leída y escrita, motivo de parada;
nunca contenido) y tiene tiempo de espera de 90 s con 1 reintento (`lib/asistente/cliente-claude.ts`); OpenAI, 120 s y 1
reintento. El panel y el webhook tienen `maxDuration` 300 s: una llamada colgada termina en error (y aviso al corredor), no
en una función cortada sin aviso.
Errores (`registrar("error_…")`), fallas del webhook, crons fallidos, mensajes no entregados y costo de
IA del día por encima de `COSTO_DIARIO_ALERTA_USD` llegan como alerta por WhatsApp a `SOPORTE_WHATSAPP`
(plantilla de aviso), una por clave y hora como máximo (`reclamar_alerta`). En serverless, cada ruta
espera las alertas pendientes (`esperarAlertas`). Lo que falla sin cortar el flujo (Google Calendar no responde, una
visita no se sincroniza) no se traga: `reportarFalla()` (`lib/monitoreo/fallas.ts`) lo registra y avisa a soporte; si
Google no deja leer lo ocupado, además queda en `google_conexiones.ultimo_error` y el corredor lo ve en Ajustes. Prueba: `GET /api/monitoreo/prueba` con
`Authorization: Bearer $CRON_SECRET`.

## Anuncios de Encuentra24
Encuentra24 no tiene API: la asistente prepara y vigila, el corredor publica. Cada anuncio tiene una
`referencia` que va en el enlace wa.me de la descripción; el primer mensaje del cliente la trae y
`atribuirContacto` enlaza el contacto al anuncio. Un anuncio nace como `borrador` (sin `e24_id` ni `url`)
y pasa a `activo` cuando el corredor abre el anuncio ya publicado en su Chrome y toca **Leer este anuncio** en la
extensión: la página trae la referencia (en el enlace wa.me) y el servidor le pone `url`, `e24_id` y `publicado_en`.
`vence_en` no se calcula todavía. Con un anuncio que no es suyo preparado, el mismo botón trae la casa a Mis casas, pausada.

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
| uso_diario | Mensajes, llamadas, imágenes, audio y costo de IA (Claude, imágenes y transcripción) por corredor y día |
| alertas | Última vez que se mandó cada alerta de monitoreo (sin ráfagas) |
| actividades | Historia de cada cliente: llamadas, mensajes, visitas, notas, etapas, ofertas y cierre |
| conocimiento | Cerebro de la asistente: lo que el corredor le enseñó y las dudas que no supo contestar |
| extension_conexiones | Extensión de Chrome conectada a un corredor: huellas del código y del permiso, último uso |
| google_conexiones | Gmail y Google Calendar del corredor: permiso cifrado, correo, hasta dónde leyó, resumen enviado |
| correos_procesados | Correos que la asistente revisó: cliente u otro, remitente, asunto, resumen y si dejó borrador |
| plataforma | Valores de toda la plataforma: topes de gasto de IA por día y por mes (una sola fila) |
| superadmins | Correos de quienes entran a /admin (solo los lee el backend) |
| busquedas_extension / busquedas_extension_anuncios | Búsqueda de dueños en curso desde la extensión y anuncios leídos (se borran al terminar) |

## Comandos
- `npm run dev` — app local.
- `npm run typecheck`, `npm run lint` (ESLint con la config de Next; las excepciones van con su razón en
  `eslint.config.mjs` o en la línea) y `npm run build` — antes de cada push. El CI los corre en cada PR y main
  debería exigirlos (protección de rama: trabajos `app` y `db`).
- `npm run test:cobertura` — las pruebas con cobertura (la corre el CI). Tiene un piso en `vitest.config.mts`
  apenas debajo de lo medido (50 % de sentencias): si baja, el CI falla. Las **acciones del servidor** se prueban en
  `tests/acciones/` sin Next ni Supabase (`entorno.ts`: Supabase en memoria que aplica los filtros y anota cada
  escritura; `mocks/`: redirect, sesión, backend). Cada acción nueva lleva su prueba de "con datos de otro corredor no
  hace nada" (y en `/admin`, de "sin ser superadmin, 404"). Lo menos probado: Google y mover o cancelar visitas.
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
