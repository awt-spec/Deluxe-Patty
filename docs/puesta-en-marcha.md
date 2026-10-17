# Puesta en marcha

Pasos para salir en vivo con un corredor (Deluxe Properties primero). En orden: cada paso usa valores
del anterior. Lo marcado **[soporte]** lo hace AWT; lo demás se puede delegar.

## 1. Meta (empezar ya: las plantillas tardan en aprobarse)

1. Meta Business de Deluxe verificado y app en Meta for Developers con el producto **WhatsApp**.
2. Agregar el número de la asistente (número nuevo y dedicado). Anotar su **Phone number ID**.
3. Crear un **usuario del sistema** con acceso a la app y generar un **token permanente** con permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`. Anotar el **App Secret** (Configuración
   de la app → Básica).
4. Enviar a aprobación estas dos plantillas, categoría **Utilidad**, idioma **español (es)**:

   | Nombre | Cuerpo |
   |---|---|
   | `aviso_corredor` | `Aviso de tu asistente: {{1}}` |
   | `recordatorio_visita` | `Hola, te recordamos tu visita con {{1}} el {{2}} para ver {{3}}. Si necesitas cambiar la hora, responde a este mensaje.` |

   Ejemplos para la revisión de Meta: `{{1}}` = "Nueva visita: Ana Mora, viernes 16 de octubre, 10:00 a. m.";
   para el recordatorio: "Patricia", "viernes 16 de octubre, 10:00 a. m.", "Casa en condominio en Escazú".

El webhook se configura en el paso 4, cuando la app ya tiene dirección.

## 2. Supabase **[soporte]**

1. Crear el proyecto (región más cercana a Vercel, por ejemplo `us-east-1`). Anotar el **Project ref**.
2. Montarlo desde este repositorio con una llave de acceso (Account → Access Tokens), sin conexión directa
   a Postgres. Aplica las migraciones en orden, carga la semilla la primera vez, configura Auth (sin
   registros abiertos, enlace a `/auth/confirmar`), revisa RLS y buckets, y deja las llaves en `.env.local`:
   ```bash
   SUPABASE_ACCESS_TOKEN=… npx tsx scripts/montar-supabase.mts <project-ref> [https://<dominio-de-la-app>]
   ```
   Se puede volver a correr: solo aplica lo pendiente. Con el dominio de Vercel, correrlo de nuevo con esa
   dirección. La semilla crea Deluxe, su horario provisional, su marca y tres propiedades **de ejemplo**
   (`EJEMPLO-*`): borrarlas cuando se carguen las reales.
3. Revisar en Auth → URL Configuration que **Site URL** sea `https://<dominio-de-la-app>` y **Redirect URLs**
   solo `https://<dominio-de-la-app>/auth/confirmar` (el script lo deja así si le pasas el dominio).
4. Auth → Providers → Email: dejar habilitado el enlace mágico. No hace falta permitir registros: el acceso
   lo da `scripts/dar-acceso.mts`.
5. Auth → Attack Protection: activar el captcha (hCaptcha o Turnstile) para que nadie gaste el límite de
   correos de entrada. Redirect URLs: solo el dominio de producción (y el de vistas previas, si se usan).

## 3. Vercel **[soporte]**

1. Nuevo proyecto en el equipo **awt1** desde `awt-spec/Deluxe-Patty`. Plan **Pro** (los crons corren cada
   hora y la mejora de fotos necesita funciones de hasta 5 minutos).
2. Dominio: un subdominio de Gurunet, por ejemplo `asistente.gurunet.<…>`.
3. Variables de entorno (Production y Preview):

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `WHATSAPP_APP_SECRET` | App Secret de Meta |
   | `WHATSAPP_VERIFY_TOKEN` | Una cadena larga al azar que inventas (se repite en Meta) |
   | `WHATSAPP_ACCESS_TOKEN` | Token permanente del usuario del sistema |
   | `WHATSAPP_PLANTILLA_AVISO` | `aviso_corredor` |
   | `WHATSAPP_PLANTILLA_RECORDATORIO` | `recordatorio_visita` |
   | `CRON_SECRET` | Otra cadena larga al azar |
   | `ANTHROPIC_API_KEY` | Llave de la API de Claude (con límite de gasto mensual) |
   | `OPENAI_API_KEY` | Llave de OpenAI (solo para "fotos"; sin ella la función queda apagada) |
   | `SOPORTE_WHATSAPP` | Tu número, por ejemplo `+5068…` |
   | `SOPORTE_PHONE_NUMBER_ID` | Phone number ID de la asistente (las alertas salen desde ese número) |
   | `COSTO_DIARIO_ALERTA_USD` | `3` (te avisa) |
   | `COSTO_DIARIO_TOPE_USD` | `10` (la IA se detiene hasta mañana) |
   | `NEXT_PUBLIC_URL_APP` | `https://<dominio-de-la-app>` |

4. Desplegar.

## 4. Conectar WhatsApp

1. En Meta → WhatsApp → Configuración → Webhook:
   - URL: `https://<dominio-de-la-app>/api/whatsapp/webhook`
   - Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`.
   - Suscribir el campo **messages**.
2. Cargar los números del corredor (editor SQL de Supabase):
   ```sql
   update corredores set
     whatsapp_numero = '+506…',           -- número de la asistente
     whatsapp_phone_number_id = '…',      -- su Phone number ID
     whatsapp_corredor = '+506…',         -- número personal de Patricia
     respuesta_automatica = false         -- piloto en sombra
   where slug = 'deluxe-properties';
   ```

## 5. Datos de Patricia

Todo desde el panel, en el teléfono de Patricia:
- **Propiedades → Nueva**: cada propiedad con su ficha y fotos. Pausar o borrar las `EJEMPLO-*`
  (editor SQL: `delete from propiedades where codigo like 'EJEMPLO-%';`).
- **Agenda → Horario**: sus franjas reales de visitas (las de la semilla son provisionales) y bloqueos.
- **Dueños → Corredores**: pegar la lista de corredores conocidos.
- **Ajustes**: tono, temas que siempre le pasan, hora del plan, zonas de Encuentra24 y rango de precio.

## 6. Acceso al panel **[soporte]**

```bash
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/dar-acceso.mts <correo-de-patricia> deluxe-properties
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/dar-acceso.mts <tu-correo> deluxe-properties soporte
```

Patricia entra en `https://<dominio-de-la-app>/entrar` con su correo.

## 6b. Demo (sin correo ni WhatsApp) **[soporte]**

Para mostrar el panel sin datos reales: un botón "Ver la demo" en `/entrar` que entra directo a una cuenta
con casas, chats y visitas de prueba. Nada sale por WhatsApp y no se suben fotos.

1. En `.env.local`: `DEMO_CORREO=demo@<tu-dominio>` (un correo inventado: nunca se le escribe).
2. `npm run demo`. Crea el corredor de demo (inactivo, con la marca de Deluxe) y su usuario.
   Volver a correrlo deja la demo como nueva.
3. En Vercel: `DEMO_CORREO` con el mismo valor y volver a desplegar. Sin esa variable el botón no aparece.

Cualquiera con el enlace puede entrar a la demo: las respuestas de "Probar la asistente" y "Agregar casa"
gastan Claude dentro del tope diario (`COSTO_DIARIO_TOPE_USD`).

## 7. Búsqueda semanal de dueños (desde tu computadora)

Encuentra24 está detrás de Cloudflare, que casi siempre frena a los servidores de GitHub Actions. Por eso
la búsqueda se corre una vez por semana desde tu computadora, con Chrome visible y tu internet de casa.

1. Zonas y rango de precios de Deluxe: en el panel, Más → Ajustes (zonas como en la dirección de
   Encuentra24, por ejemplo `san-jose-provincia-escazu`).
2. En `.env.local` (lo deja `scripts/montar-supabase.mts`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y
   además `ANTHROPIC_API_KEY` (Haiku confirma si cada anuncio es de un dueño). `WHATSAPP_ACCESS_TOKEN` es
   opcional: sin él los dueños solo quedan en el panel.
3. La primera vez: `npx playwright install chromium` (si no tienes Google Chrome; con Chrome usa ese).
4. Cada semana: `npm run duenos`. Se abre Chrome; si Encuentra24 pide verificar que eres una persona,
   resuélvelo en la ventana y la búsqueda sigue sola. Al final dice cuántos dueños nuevos guardó; están en
   el panel, en Más → Dueños directos. Las cookies quedan en `.perfil-encuentra24/` y las semanas
   siguientes casi nunca pide verificar.

Para probar la lectura de una zona sin tocar datos: `npm run duenos:prueba -- <zona> [páginas]`. También
existe en GitHub (Actions → **Búsqueda semanal de dueños** → Run workflow, con `prueba_zona`), pero ahí
Cloudflare suele frenarla.

## 8. Verificación antes del piloto

- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/monitoreo/prueba` → te llega la alerta.
- [ ] Desde un teléfono de prueba, escribirle a la asistente → aparece el borrador en el panel → al aprobarlo llega.
- [ ] Pedir una visita → la asistente propone dos horarios → elegir uno → aprobar → la cita aparece en la Agenda.
- [ ] Pedir un descuento → la conversación queda en "Te espera" y a Patricia le llega el aviso.
- [ ] Patricia escribe "plan", "ficha EJEMPLO-001" y "anuncio EJEMPLO-001" desde su número → recibe cada cosa.
- [ ] Suscribir la Agenda en el calendario del teléfono.

## 9. Piloto en sombra y salida

1. Tres días con `respuesta_automatica = false`: Patricia aprueba o corrige cada respuesta desde el panel.
2. Cuando apruebe sin cambios la gran mayoría del último día: Ajustes → "La asistente contesta sola".
3. Sesión de una hora con Patricia: panel, tomar control, comandos por WhatsApp.
4. El primer mes: revisar cada semana el uso y el costo (Ajustes → Uso del mes) contra el modelo de la propuesta.
