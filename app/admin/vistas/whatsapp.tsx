import type { FilaAdmin, llavesWhatsApp } from "@/lib/admin/datos";
import { EXPLICA_DIAGNOSTICO } from "@/lib/sitio/fotos";
import type { Tono } from "@/lib/admin/atencion";
import { ErrorWhatsApp, explicarErrorWhatsApp } from "@/lib/whatsapp/enviar";
import type { EstadoNumero, RespuestaMeta } from "@/lib/whatsapp/graph";
import { IconoAlerta, IconoCheck, IconoInfo } from "../../panel/iconos";
import { conectarWebhook, registrarNumeroWhatsApp, suscribirAppWhatsApp } from "../acciones";
import { Copiar } from "../copiar";
import { Encabezado, Nota, Pildora, hace } from "../ui";

// WhatsApp (vista pura): la puesta en marcha con Meta como pasos en orden. Cada paso tiene su estado (verde listo,
// ámbar por revisar, rojo bloquea), qué significa en palabras y el botón que lo arregla al lado. Las llaves nunca se
// muestran: solo si están puestas.

export interface DatosWhatsApp {
  llaves: ReturnType<typeof llavesWhatsApp>;
  webhook: string;
  conectables: FilaAdmin[];
  /** Estado en Meta de cada número de `conectables` (mismo orden); null sin token. */
  estados: (RespuestaMeta<EstadoNumero> | null)[];
  wabaValido: string | null;
  apps: RespuestaMeta<{ data?: { whatsapp_business_api_data?: { id?: string; name?: string } }[] }> | null;
  hayToken: boolean;
  ahora?: Date;
}

const ESTADO_NUMERO: Record<string, [string, Tono]> = {
  CONNECTED: ["Conectado", "bien"],
  PENDING: ["Pendiente: falta registrarlo", "poco"],
  DISCONNECTED: ["Desconectado", "mal"],
  FLAGGED: ["Marcado por Meta", "mal"],
  RESTRICTED: ["Restringido", "mal"],
  UNVERIFIED: ["Sin verificar", "poco"],
};
const CALIDAD: Record<string, [string, Tono]> = { GREEN: ["Alta", "bien"], YELLOW: ["Media", "poco"], RED: ["Baja", "mal"], UNKNOWN: ["Sin dato", "poco"] };
const VERIFICACION: Record<string, string> = { VERIFIED: "Verificado", NOT_VERIFIED: "Sin verificar", EXPIRED: "Vencido" };
const NOMBRE: Record<string, string> = { APPROVED: "Aprobado", PENDING_REVIEW: "En revisión", DECLINED: "Rechazado", AVAILABLE_WITHOUT_REVIEW: "Disponible" };

const PALABRA: Record<Tono, string> = { bien: "Listo", poco: "Revisar", mal: "Falta", info: "Info", gris: "Sin comprobar" };
const peor = (tonos: Tono[]): Tono => (tonos.includes("mal") ? "mal" : tonos.includes("poco") ? "poco" : tonos.includes("gris") ? "gris" : "bien");

function IconoEstado({ tono }: { tono: Tono }) {
  return (
    <span className={`ad-estado-icono ${tono}`} aria-hidden>
      {tono === "bien" ? <IconoCheck tamano={18} /> : tono === "gris" || tono === "info" ? <IconoInfo tamano={18} /> : <IconoAlerta tamano={18} />}
    </span>
  );
}

function Paso({ n, titulo, tono, resumen, children }: { n: number; titulo: string; tono: Tono; resumen: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className={`ad-paso ${tono}`}>
      <span className="ad-paso-numero" aria-hidden>
        {tono === "bien" ? <IconoCheck tamano={18} /> : n}
      </span>
      <div className="ad-paso-cuerpo">
        <header className="ad-paso-cab">
          <h2>
            <span className="ad-oculto">Paso {n}: </span>
            {titulo}
          </h2>
          <Pildora tono={tono}>{PALABRA[tono]}</Pildora>
        </header>
        <p className="ad-paso-resumen">{resumen}</p>
        {children}
      </div>
    </li>
  );
}

function Fila({ tono, titulo, children, accion }: { tono: Tono; titulo: React.ReactNode; children?: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className={`ad-fila-estado ${tono}`}>
      <IconoEstado tono={tono} />
      <div className="ad-fila-texto">
        <strong>{titulo}</strong>
        {children && <span>{children}</span>}
      </div>
      {accion && <div className="ad-fila-accion">{accion}</div>}
    </div>
  );
}

export function VistaWhatsApp({ llaves, webhook, conectables, estados, wabaValido, apps, hayToken, ahora = new Date() }: DatosWhatsApp) {
  // 1. Llaves
  const LLAVES: [boolean, string, string, boolean][] = [
    [llaves.token, "WHATSAPP_ACCESS_TOKEN", "Token permanente del usuario del sistema: sin él nada sale.", true],
    [llaves.secreto, "WHATSAPP_APP_SECRET", "Clave secreta de la app: verifica que lo que llega es de Meta.", true],
    [llaves.verificacion, "WHATSAPP_VERIFY_TOKEN", "La frase que Meta usa para verificar el webhook.", true],
    [llaves.urlApp, "NEXT_PUBLIC_URL_APP", "Dirección pública de la app.", true],
    [llaves.openai, "OPENAI_API_KEY", "Transcribe notas de voz y hace las imágenes con IA.", false],
    [llaves.soporte, "SOPORTE_WHATSAPP + SOPORTE_PHONE_NUMBER_ID", "Opcional: alertas de fallas por WhatsApp.", false],
    [
      llaves.sitioFotos === "conectado",
      "SITIO_FOTOS_URL + SITIO_FOTOS_SECRETO",
      `Subir fotos al sitio desde Patty. ${EXPLICA_DIAGNOSTICO[llaves.sitioFotos]}`,
      false,
    ],
  ];
  const tonoLlaves: Tono = LLAVES.some(([ok, , , req]) => req && !ok) ? "mal" : LLAVES.some(([ok]) => !ok) ? "poco" : "bien";

  // 2 y 3. Números: estado en Meta y registro en la API.
  const numeros = conectables.map((f, i) => {
    const e = estados[i] ?? null;
    const datos = e && e.ok ? e.datos : null;
    const estado = datos?.status ? (ESTADO_NUMERO[datos.status] ?? [datos.status, "poco" as Tono]) : null;
    const tonoNumero: Tono = !hayToken ? "gris" : e && !e.ok ? "mal" : (estado?.[1] ?? "poco");
    const falta133010 = e !== null && !e.ok && e.codigo === 133010;
    const tonoRegistro: Tono = datos?.status === "PENDING" || falta133010 ? "mal" : datos?.status === "CONNECTED" ? "bien" : "gris";
    return { f, e, datos, estado, tonoNumero, tonoRegistro, abrirRegistro: datos?.status === "PENDING" || falta133010 };
  });
  const tonoNumeros: Tono = conectables.length === 0 ? "mal" : peor(numeros.map((x) => x.tonoNumero));
  const tonoRegistros: Tono = conectables.length === 0 ? "gris" : peor(numeros.map((x) => x.tonoRegistro));

  // 4. Suscripción
  const suscritas = apps && apps.ok ? (apps.datos.data ?? []) : null;
  const tonoSuscripcion: Tono = !llaves.token ? "mal" : suscritas === null ? (apps && !apps.ok ? "mal" : "gris") : suscritas.length > 0 ? "bien" : "mal";

  // 5. Webhook
  const llegan = conectables.some((f) => f.entrantes24h > 0 || f.ultimoEntrante);
  const tonoWebhook: Tono = !llaves.secreto || !llaves.verificacion ? "mal" : llegan ? "bien" : "poco";

  const listos = [tonoLlaves, tonoNumeros, tonoRegistros, tonoSuscripcion, tonoWebhook].filter((t) => t === "bien").length;

  return (
    <>
      <Encabezado
        titulo="WhatsApp"
        descripcion="La conexión con Meta, en vivo y en orden. Sigue los pasos de arriba hacia abajo: cada uno dice qué falta y tiene su botón."
        acciones={
          <span className="ad-progreso" aria-label={`${listos} de 5 pasos listos`}>
            <strong>{listos}</strong> de 5 listos
          </span>
        }
      />

      <ol className="ad-pasos">
        <Paso
          n={1}
          titulo="Llaves en el servidor"
          tono={tonoLlaves}
          resumen={
            tonoLlaves === "bien"
              ? "Todas las llaves están puestas."
              : tonoLlaves === "mal"
                ? "Falta una llave obligatoria: se pone en Vercel → Settings → Environment Variables (Production) y después Redeploy."
                : "Las obligatorias están; falta alguna opcional."
          }
        >
          <div className="ad-filas">
            {LLAVES.map(([ok, nombre, ayuda, req]) => (
              <Fila key={nombre} tono={ok ? "bien" : req ? "mal" : "poco"} titulo={<code>{nombre}</code>}>
                {ok ? "Puesta. " : req ? "Falta. " : "No está. "}
                {ayuda}
              </Fila>
            ))}
          </div>
        </Paso>

        <Paso
          n={2}
          titulo="Número de cada corredor"
          tono={tonoNumeros}
          resumen={
            conectables.length === 0
              ? "Ningún corredor activo tiene Phone number ID. Ponlo en la pantalla del corredor."
              : !hayToken
                ? "Sin WHATSAPP_ACCESS_TOKEN no se puede consultar el estado en Meta."
                : "Lo que Meta dice de cada número, ahora mismo."
          }
        >
          <div className="ad-numeros">
            {numeros.map(({ f, e, datos, estado, tonoNumero }) => {
              const calidad = datos?.quality_rating ? (CALIDAD[datos.quality_rating] ?? [datos.quality_rating, "poco" as Tono]) : null;
              return (
                <article key={f.c.id} className="ad-numero">
                  <Fila
                    tono={tonoNumero}
                    titulo={f.c.nombre}
                    accion={
                      <a href={`/admin/corredores/${f.c.id}#datos`} className="ad-boton chico">
                        Ver corredor
                      </a>
                    }
                  >
                    Phone number ID {f.c.whatsapp_phone_number_id}
                    {estado ? ` · ${estado[0]}` : ""}
                  </Fila>
                  {e && !e.ok && (
                    <Nota tono="mal">
                      <IconoAlerta tamano={18} />
                      <span>
                        Meta no devolvió el estado (estado {e.status}
                        {e.codigo ? ` · código ${e.codigo}` : ""}). {explicarErrorWhatsApp(new ErrorWhatsApp(e.status, e.codigo))}
                      </span>
                    </Nota>
                  )}
                  {datos && (
                    <dl className="ad-datos-numero">
                      <div>
                        <dt>Número</dt>
                        <dd>{datos.display_phone_number ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Nombre visible</dt>
                        <dd>{datos.verified_name ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Calidad</dt>
                        <dd>{calidad ? <Pildora tono={calidad[1]}>{calidad[0]}</Pildora> : "—"}</dd>
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
                          {f.entrantes24h} <span className="ad-suave">· último {hace(f.ultimoEntrante, ahora)}</span>
                        </dd>
                      </div>
                    </dl>
                  )}
                </article>
              );
            })}
          </div>
        </Paso>

        <Paso
          n={3}
          titulo="Registrar el número en la API"
          tono={tonoRegistros}
          resumen={
            tonoRegistros === "bien"
              ? "Los números están registrados."
              : tonoRegistros === "mal"
                ? "Hay un número pendiente (o Meta respondió 133010): regístralo con un PIN."
                : "Si Meta dice Pendiente o da el error 133010, regístralo aquí."
          }
        >
          <div className="ad-filas">
            {numeros.map(({ f, tonoRegistro, abrirRegistro }) => (
              <details key={f.c.id} className={`ad-detalle ${tonoRegistro}`} open={abrirRegistro}>
                <summary>
                  <IconoEstado tono={tonoRegistro} />
                  <span>
                    <strong>{f.c.nombre}</strong>
                    <span className="ad-suave">{tonoRegistro === "bien" ? " · registrado" : tonoRegistro === "mal" ? " · falta registrarlo" : " · registrar si hace falta"}</span>
                  </span>
                </summary>
                <p className="ad-ayuda">
                  Meta pide un PIN de 6 números para la verificación en dos pasos. Lo inventas tú y lo guardas: se necesita si después hay que volver a registrarlo.
                </p>
                <form action={registrarNumeroWhatsApp} className="ad-form-linea">
                  <input type="hidden" name="id" value={f.c.id} />
                  <div className="ad-campo">
                    <label htmlFor={`pin-${f.c.id}`}>PIN de 6 números</label>
                    <input id={`pin-${f.c.id}`} name="pin" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off" placeholder="000000" required />
                  </div>
                  <button type="submit" className={`ad-boton${tonoRegistro === "mal" ? " primario" : ""}`}>
                    Registrar número
                  </button>
                </form>
              </details>
            ))}
            {conectables.length === 0 && <p className="ad-ayuda">Aparece aquí cuando un corredor activo tenga Phone number ID.</p>}
          </div>
        </Paso>

        <Paso
          n={4}
          titulo="Suscribir la app a la cuenta de WhatsApp"
          tono={tonoSuscripcion}
          resumen={
            suscritas === null
              ? apps && !apps.ok
                ? `No pude leer las apps de esa cuenta (estado ${apps.status}${apps.codigo ? ` · código ${apps.codigo}` : ""}).`
                : "Si la app no está suscrita a la cuenta de WhatsApp Business, no llega ningún mensaje. Escribe el WABA ID para comprobarlo o suscribirla."
              : suscritas.length === 0
                ? "Ninguna app suscrita a esa cuenta: por eso no llegan mensajes. Toca Suscribir app."
                : `Apps suscritas: ${suscritas.map((a) => a.whatsapp_business_api_data?.name ?? a.whatsapp_business_api_data?.id).join(", ")}.`
          }
        >
          <form action={suscribirAppWhatsApp} className="ad-form-linea">
            <div className="ad-campo crece">
              <label htmlFor="waba">WABA ID</label>
              <input id="waba" name="waba" inputMode="numeric" pattern="\d{5,25}" defaultValue={wabaValido ?? ""} placeholder="Solo números" required aria-describedby="waba-ayuda" />
              <small id="waba-ayuda">Identificador de la cuenta de WhatsApp Business (Meta → WhatsApp → Configuración de la API).</small>
            </div>
            <button type="submit" className={`ad-boton${tonoSuscripcion === "mal" && llaves.token ? " primario" : ""}`} disabled={!llaves.token} aria-describedby={!llaves.token ? "waba-falta" : undefined}>
              Suscribir app
            </button>
          </form>
          {!llaves.token && (
            <p id="waba-falta" className="ad-ayuda">
              Primero pon WHATSAPP_ACCESS_TOKEN (paso 1).
            </p>
          )}
        </Paso>

        <Paso
          n={5}
          titulo="Conectar el webhook"
          tono={tonoWebhook}
          resumen={
            tonoWebhook === "mal"
              ? "Primero pon APP_SECRET y VERIFY_TOKEN en Vercel y redespliega."
              : llegan
                ? "Están llegando mensajes: el webhook funciona."
                : "Todavía no llega ningún mensaje. Conecta el webhook con el campo messages."
          }
        >
          <div className="ad-direccion">
            <span className="ad-suave">Dirección que Meta debe llamar</span>
            <code>{webhook}</code>
            <Copiar texto={webhook} />
          </div>
          <form action={conectarWebhook} className="ad-form-linea">
            <div className="ad-campo crece">
              <label htmlFor="app_id">App ID</label>
              <input id="app_id" name="app_id" inputMode="numeric" placeholder="Solo números" required aria-describedby="app_id-ayuda" />
              <small id="app_id-ayuda">Meta → Configuración de la app → Básica.</small>
            </div>
            <button type="submit" className={`ad-boton${tonoWebhook !== "bien" ? " primario" : ""}`} disabled={!llaves.secreto || !llaves.verificacion}>
              Conectar webhook
            </button>
          </form>
        </Paso>
      </ol>
    </>
  );
}
