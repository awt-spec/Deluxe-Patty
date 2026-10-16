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

1. Crear el proyecto (región más cercana a Vercel, por ejemplo `us-east-1`). Anotar **Project URL**,
   **anon key** y **service_role key** (Configuración → API).
2. Aplicar las migraciones desde este repositorio:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>
   npx supabase db push
   ```
3. Cargar la semilla: abrir `supabase/seed.sql` en el editor SQL de Supabase y ejecutarlo. Crea Deluxe, su
   horario provisional, su marca y tres propiedades **de ejemplo** (`EJEMPLO-*`): borrarlas cuando se carguen
   las reales.
4. Auth → URL Configuration:
   - **Site URL**: `https://<dominio-de-la-app>`
   - **Redirect URLs**: `https://<dominio-de-la-app>/auth/confirmar`
5. Auth → Providers → Email: dejar habilitado el enlace mágico. No hace falta permitir registros: el acceso
   lo da `scripts/dar-acceso.mts`.

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
   | `COSTO_DIARIO_ALERTA_USD` | `3` |

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

## 7. Búsqueda semanal de dueños (GitHub)

En el repositorio → Settings → Secrets and variables → Actions:
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `WHATSAPP_ACCESS_TOKEN`.
- Variable: `WHATSAPP_PLANTILLA_AVISO` = `aviso_corredor`.

Corre solo cada lunes. Para probar la lectura sin tocar datos: Actions → **Búsqueda semanal de dueños** →
Run workflow, con una zona en `prueba_zona`.

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
