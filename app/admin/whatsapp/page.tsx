import { cargarCorredores, llavesWhatsApp } from "@/lib/admin/datos";
import { urlWebhook } from "@/lib/admin/urls";
import { createAdminClient } from "@/lib/supabase/admin";
import { ErrorWhatsApp, explicarErrorWhatsApp } from "@/lib/whatsapp/enviar";
import { appsSuscritas, estadoNumero } from "@/lib/whatsapp/graph";
import { Insignia, Mensaje, hace } from "../ui";
import { conectarWebhook, registrarNumeroWhatsApp, suscribirAppWhatsApp } from "../acciones";

// Diagnóstico de la conexión con Meta, en vivo: llaves del servidor, estado de cada número y suscripción de la app.
// Aquí se resuelven los tres bloqueos de la puesta en marcha: número sin registrar (133010), app sin suscribir a la
// cuenta y webhook sin conectar. Las llaves nunca se muestran: solo si existen.

const ESTADO_NUMERO: Record<string, [string, "verde" | "ambar" | "rojo"]> = {
  CONNECTED: ["Conectado", "verde"],
  PENDING: ["Pendiente: falta registrarlo", "ambar"],
  DISCONNECTED: ["Desconectado", "rojo"],
  FLAGGED: ["Marcado por Meta", "rojo"],
  RESTRICTED: ["Restringido", "rojo"],
  UNVERIFIED: ["Sin verificar", "ambar"],
};
const CALIDAD: Record<string, [string, "verde" | "ambar" | "rojo"]> = { GREEN: ["Alta", "verde"], YELLOW: ["Media", "ambar"], RED: ["Baja", "rojo"], UNKNOWN: ["Sin dato", "ambar"] };
const VERIFICACION: Record<string, string> = { VERIFIED: "Verificado", NOT_VERIFIED: "Sin verificar", EXPIRED: "Vencido" };
const NOMBRE: Record<string, string> = { APPROVED: "Aprobado", PENDING_REVIEW: "En revisión", DECLINED: "Rechazado", AVAILABLE_WITHOUT_REVIEW: "Disponible" };

function Llave({ ok, nombre, ayuda }: { ok: boolean; nombre: string; ayuda: string }) {
  return (
    <li>
      {ok ? <Insignia tono="verde">Puesta</Insignia> : <Insignia tono="rojo">Falta</Insignia>}
      <span>
        <code>{nombre}</code> <span className="adm-suave">{ayuda}</span>
      </span>
    </li>
  );
}

export default async function WhatsApp({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string; waba?: string }> }) {
  const { m, ok, waba } = await searchParams;
  const llaves = llavesWhatsApp();
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const webhook = await urlWebhook();
  const { filas } = await cargarCorredores(createAdminClient());
  const conectables = filas.filter((f) => f.c.activo && f.c.whatsapp_phone_number_id);

  // Estado de cada número en Meta (en paralelo, con tope de 8 s cada llamada).
  const estados = await Promise.all(conectables.map((f) => (token ? estadoNumero(token, f.c.whatsapp_phone_number_id!) : Promise.resolve(null))));
  const wabaValido = waba && /^\d{5,25}$/.test(waba) ? waba : null;
  const apps = token && wabaValido ? await appsSuscritas(token, wabaValido) : null;

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <header className="adm-encabezado">
        <h1>WhatsApp</h1>
        <p>Estado de la conexión con Meta, en vivo. Las llaves nunca se muestran: solo si están puestas.</p>
      </header>

      <section className="adm-seccion">
        <h2>1. Llaves en el servidor</h2>
        <ul className="adm-lista simple">
          <Llave ok={llaves.token} nombre="WHATSAPP_ACCESS_TOKEN" ayuda="Token permanente del usuario del sistema" />
          <Llave ok={llaves.secreto} nombre="WHATSAPP_APP_SECRET" ayuda="Clave secreta de la app: verifica la firma de Meta" />
          <Llave ok={llaves.verificacion} nombre="WHATSAPP_VERIFY_TOKEN" ayuda="La frase que Meta usa para verificar el webhook" />
          <Llave ok={llaves.urlApp} nombre="NEXT_PUBLIC_URL_APP" ayuda="Dirección pública de la app" />
          <Llave ok={llaves.soporte} nombre="SOPORTE_WHATSAPP + SOPORTE_PHONE_NUMBER_ID" ayuda="Opcional: alertas de fallas por WhatsApp" />
        </ul>
        <p className="adm-suave">Se ponen en Vercel → Settings → Environment Variables (Production) y después Redeploy.</p>
      </section>

      <section className="adm-seccion">
        <h2>2. Números conectados</h2>
        {conectables.length === 0 && <p className="adm-vacio">Ningún corredor activo tiene Phone number ID. Ponlo en la pantalla del corredor.</p>}
        {!token && conectables.length > 0 && <p className="adm-mensaje mal">Sin WHATSAPP_ACCESS_TOKEN no se puede consultar el estado en Meta.</p>}
        {conectables.map((f, i) => {
          const e = estados[i];
          const datos = e && e.ok ? e.datos : null;
          const estado = datos?.status ? (ESTADO_NUMERO[datos.status] ?? [datos.status, "ambar" as const]) : null;
          const calidad = datos?.quality_rating ? (CALIDAD[datos.quality_rating] ?? [datos.quality_rating, "ambar" as const]) : null;
          return (
            <article key={f.c.id} className="adm-numero">
              <div className="adm-numero-cab">
                <strong>{f.c.nombre}</strong>
                <span className="adm-suave">Phone number ID {f.c.whatsapp_phone_number_id}</span>
              </div>
              {e && !e.ok && (
                <p className="adm-mensaje mal">
                  Meta no devolvió el estado (estado {e.status}
                  {e.codigo ? ` · código ${e.codigo}` : ""}). {explicarErrorWhatsApp(new ErrorWhatsApp(e.status, e.codigo))}
                </p>
              )}
              {datos && (
                <dl className="adm-estado">
                  <div>
                    <dt>Número</dt>
                    <dd>{datos.display_phone_number ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Nombre visible</dt>
                    <dd>{datos.verified_name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>{estado ? <Insignia tono={estado[1]}>{estado[0]}</Insignia> : "—"}</dd>
                  </div>
                  <div>
                    <dt>Calidad</dt>
                    <dd>{calidad ? <Insignia tono={calidad[1]}>{calidad[0]}</Insignia> : "—"}</dd>
                  </div>
                  <div>
                    <dt>Código de verificación</dt>
                    <dd>{datos.code_verification_status ? (VERIFICACION[datos.code_verification_status] ?? datos.code_verification_status) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Aprobación del nombre</dt>
                    <dd>{datos.name_status ? (NOMBRE[datos.name_status] ?? datos.name_status) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Tipo</dt>
                    <dd>{datos.account_mode === "SANDBOX" ? "Número de prueba (hasta 5 destinatarios)" : datos.account_mode === "LIVE" ? "Número real" : (datos.account_mode ?? "—")}</dd>
                  </div>
                  <div>
                    <dt>Mensajes recibidos (24 h)</dt>
                    <dd>
                      {f.entrantes24h} <span className="adm-suave">· último {hace(f.ultimoEntrante)}</span>
                    </dd>
                  </div>
                </dl>
              )}
              <details className="adm-detalle" open={datos?.status === "PENDING" || (e !== null && !e.ok && e.codigo === 133010)}>
                <summary>Registrar el número en la API (error 133010 o estado Pendiente)</summary>
                <p className="adm-suave">
                  Meta pide un PIN de 6 números para la verificación en dos pasos. Lo inventas tú y lo guardas: se necesita si después hay que volver a
                  registrarlo.
                </p>
                <form action={registrarNumeroWhatsApp} className="adm-form en-linea">
                  <input type="hidden" name="id" value={f.c.id} />
                  <label>
                    PIN de 6 números
                    <input name="pin" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off" placeholder="000000" required />
                  </label>
                  <button type="submit" className="adm-boton">
                    Registrar número
                  </button>
                </form>
              </details>
            </article>
          );
        })}
      </section>

      <section className="adm-seccion">
        <h2>3. Webhook: que los mensajes lleguen</h2>
        <p>
          Dirección que Meta debe llamar: <code className="adm-copiar">{webhook}</code>
        </p>
        <p className="adm-suave">
          Dos cosas tienen que cumplirse: que la app tenga esa dirección como webhook con el campo <code>messages</code>, y que la app esté suscrita a la
          cuenta de WhatsApp Business. Se hacen desde aquí.
        </p>

        <h3>Conectar el webhook en Meta</h3>
        <form action={conectarWebhook} className="adm-form en-linea">
          <label>
            App ID <small>Meta → Configuración de la app → Básica</small>
            <input name="app_id" inputMode="numeric" placeholder="Solo números" required />
          </label>
          <button type="submit" className="adm-boton" disabled={!llaves.secreto || !llaves.verificacion}>
            Conectar webhook
          </button>
        </form>
        {(!llaves.secreto || !llaves.verificacion) && <p className="adm-suave">Primero pon APP_SECRET y VERIFY_TOKEN en Vercel y redespliega.</p>}

        <h3>Suscribir la app a la cuenta de WhatsApp</h3>
        <form action={suscribirAppWhatsApp} className="adm-form en-linea">
          <label>
            WABA ID <small>Identificador de la cuenta de WhatsApp Business</small>
            <input name="waba" inputMode="numeric" defaultValue={wabaValido ?? ""} placeholder="Solo números" required />
          </label>
          <button type="submit" className="adm-boton" disabled={!llaves.token}>
            Suscribir app
          </button>
        </form>
        {apps && apps.ok && (
          <p className="adm-suave">
            Apps suscritas a esa cuenta: {(apps.datos.data ?? []).length === 0 ? "ninguna (por eso no llegan mensajes)" : (apps.datos.data ?? []).map((a) => a.whatsapp_business_api_data?.name ?? a.whatsapp_business_api_data?.id).join(", ")}.
          </p>
        )}
        {apps && !apps.ok && (
          <p className="adm-mensaje mal">
            No pude leer las apps de esa cuenta (estado {apps.status}
            {apps.codigo ? ` · código ${apps.codigo}` : ""}).
          </p>
        )}
      </section>
    </>
  );
}
