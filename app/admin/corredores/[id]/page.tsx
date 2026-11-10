import Link from "next/link";
import { notFound } from "next/navigation";
import { cargarCorredores } from "@/lib/admin/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { Barra, Insignia, Mensaje, hace, usd } from "../../ui";
import { darAcceso, guardarDatosCorredor, guardarTopesCorredor, probarWhatsApp, quitarAcceso } from "../../acciones";

export default async function CorredorDetalle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { m, ok } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createAdminClient();
  const { filas, plataforma } = await cargarCorredores(db, id);
  const f = filas[0];
  if (!f) notFound();
  const c = f.c;

  // Quién tiene acceso a este corredor (correo desde Supabase Auth).
  const [{ data: miembros }, { data: usuarios }] = await Promise.all([
    db.from("miembros").select("user_id, rol, created_at").eq("corredor_id", id),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const correoDe = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? "(sin correo)"]));

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <Link href="/admin/corredores" className="adm-volver">
        ‹ Corredores
      </Link>
      <header className="adm-encabezado">
        <h1>
          {c.nombre} {c.activo ? <Insignia tono="verde">Activo</Insignia> : <Insignia>Demo / inactivo</Insignia>}
        </h1>
        <p>
          {c.nombre_contacto} · último mensaje de un cliente {hace(f.ultimoEntrante)}
        </p>
      </header>

      <section className="adm-seccion" id="datos">
        <h2>Datos y WhatsApp</h2>
        <form action={guardarDatosCorredor} className="adm-form">
          <input type="hidden" name="id" value={id} />
          <label>
            Phone number ID
            <input name="phone_number_id" defaultValue={c.whatsapp_phone_number_id ?? ""} inputMode="numeric" placeholder="Lo da Meta en Configuración de la API" />
            <small>Identifica el número en Meta. Es lo que usa el sistema para saber a quién pertenece cada mensaje.</small>
          </label>
          <label>
            Número de la asistente
            <input name="whatsapp_numero" defaultValue={c.whatsapp_numero ?? ""} type="tel" placeholder="+506 8888 8888" />
            <small>El que ven los clientes. Va en los enlaces wa.me de fichas y anuncios. Con el número de prueba de Meta, déjalo vacío.</small>
          </label>
          <label>
            Celular del corredor
            <input name="whatsapp_corredor" defaultValue={c.whatsapp_corredor ?? ""} type="tel" placeholder="+506 8888 8888" />
            <small>Su WhatsApp personal. Ahí llegan el plan del día y los avisos, y con él el sistema lo reconoce cuando escribe.</small>
          </label>
          <label className="adm-casilla">
            <input type="checkbox" name="respuesta_automatica" defaultChecked={c.respuesta_automatica} />
            <span>
              Responder solo
              <small>Apagado es el piloto en sombra: la asistente redacta y el corredor aprueba cada respuesta.</small>
            </span>
          </label>
          <label className="adm-casilla">
            <input type="checkbox" name="activo" defaultChecked={c.activo} />
            <span>
              Cuenta activa
              <small>Un corredor inactivo no manda nada por WhatsApp (es lo que usa la demo).</small>
            </span>
          </label>
          <button type="submit" className="adm-boton primario">
            Guardar datos
          </button>
        </form>
      </section>

      <section className="adm-seccion" id="probar">
        <h2>Probar WhatsApp</h2>
        <p className="adm-suave">
          Manda la plantilla <code>hello_world</code> de Meta a un celular, para comprobar la llave y el número. Con el número de prueba, el celular tiene
          que estar verificado en la lista de Meta.
        </p>
        <form action={probarWhatsApp} className="adm-form en-linea">
          <input type="hidden" name="id" value={id} />
          <label>
            Celular
            <input name="telefono" type="tel" inputMode="tel" placeholder="+506 8888 8888" required disabled={!c.whatsapp_phone_number_id || !c.activo} />
          </label>
          <button type="submit" className="adm-boton" disabled={!c.whatsapp_phone_number_id || !c.activo}>
            Mandar mensaje de prueba
          </button>
        </form>
        {!c.whatsapp_phone_number_id && <p className="adm-suave">Primero pon el Phone number ID arriba.</p>}
        {c.whatsapp_phone_number_id && (
          <p className="adm-suave">
            ¿Meta rechaza el envío? Mira el estado del número en{" "}
            <Link href="/admin/whatsapp" className="adm-enlace">
              WhatsApp
            </Link>
            .
          </p>
        )}
      </section>

      <section className="adm-seccion" id="ia">
        <h2>Gasto de IA y topes</h2>
        <div className="adm-uso">
          <div>
            <span className="adm-suave">Hoy</span>
            <strong>
              {usd(f.gastoHoy)} <span className="adm-suave">de {usd(f.topeDia)}</span>
            </strong>
            <Barra gasto={f.gastoHoy} tope={f.topeDia} />
            <small>
              Claude {usd(f.hoy.costoClaude)} ({f.hoy.llamadas} llamadas) · Imágenes {usd(f.hoy.costoImagenes)} ({f.hoy.imagenes})
            </small>
          </div>
          <div>
            <span className="adm-suave">Este mes</span>
            <strong>
              {usd(f.gastoMes)} <span className="adm-suave">de {usd(f.topeMes)}</span>
            </strong>
            <Barra gasto={f.gastoMes} tope={f.topeMes} />
            <small>
              Claude {usd(f.mes.costoClaude)} ({f.mes.llamadas} llamadas) · Imágenes {usd(f.mes.costoImagenes)} ({f.mes.imagenes})
            </small>
          </div>
          <div>
            <span className="adm-suave">Mensajes del mes</span>
            <strong>
              {f.mensajesMes} <span className="adm-suave">de {c.tope_mensajes_mes}</span>
            </strong>
            <Barra gasto={f.mensajesMes} tope={c.tope_mensajes_mes} />
            <small>Aviso a los {c.aviso_mensajes_mes}.</small>
          </div>
        </div>
        <form action={guardarTopesCorredor} className="adm-form en-linea">
          <input type="hidden" name="id" value={id} />
          <label>
            Tope propio por día (USD)
            <input name="tope_dia" defaultValue={c.tope_ia_dia_usd ?? ""} inputMode="decimal" placeholder={`${plataforma.topeDia} (plataforma)`} />
          </label>
          <label>
            Tope propio por mes (USD)
            <input name="tope_mes" defaultValue={c.tope_ia_mes_usd ?? ""} inputMode="decimal" placeholder={`${plataforma.topeMes} (plataforma)`} />
          </label>
          <label className="adm-casilla">
            <input type="checkbox" name="imagenes" defaultChecked={c.imagenes_activas} />
            <span>Puede generar imágenes</span>
          </label>
          <button type="submit" className="adm-boton">
            Guardar topes
          </button>
        </form>
        <p className="adm-suave">Vacío usa el de la plataforma; 0 apaga la IA de este corredor.</p>
      </section>

      <section className="adm-seccion" id="accesos">
        <h2>Quién entra a este corredor</h2>
        {(miembros ?? []).length === 0 ? (
          <p className="adm-vacio">Nadie tiene acceso todavía.</p>
        ) : (
          <ul className="adm-lista simple">
            {(miembros ?? []).map((mi) => (
              <li key={mi.user_id as string}>
                <span>
                  {correoDe.get(mi.user_id as string) ?? "(usuario borrado)"} <Insignia>{mi.rol === "soporte" ? "Soporte" : "Corredor"}</Insignia>
                </span>
                <form action={quitarAcceso}>
                  <input type="hidden" name="corredor_id" value={id} />
                  <input type="hidden" name="user_id" value={mi.user_id as string} />
                  <button type="submit" className="adm-boton chico peligro">
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={darAcceso} className="adm-form en-linea">
          <input type="hidden" name="corredor_id" value={id} />
          <label>
            Dar acceso a un correo que ya tiene usuario
            <input name="correo" type="email" placeholder="correo@ejemplo.com" required />
          </label>
          <label>
            Rol
            <select name="rol" defaultValue="corredor">
              <option value="corredor">Corredor</option>
              <option value="soporte">Soporte</option>
            </select>
          </label>
          <button type="submit" className="adm-boton">
            Dar acceso
          </button>
        </form>
        <p className="adm-suave">
          ¿El correo no tiene usuario?{" "}
          <Link href="/admin/accesos" className="adm-enlace">
            Créalo en Accesos
          </Link>
          .
        </p>
      </section>
    </>
  );
}
