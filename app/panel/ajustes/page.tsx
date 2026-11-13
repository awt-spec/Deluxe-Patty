import Link from "next/link";
import { Volver } from "../volver";
import { fechaCorta } from "@/lib/formato";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { desconectarGoogle, guardarAjustes, probarWhatsApp, salir } from "../acciones";
import { Aviso } from "../aviso";
import { BotonEnviar } from "../boton-enviar";

type Corredor = {
  zonas_e24: string[];
  precio_busqueda_min: number | null;
  precio_busqueda_max: number | null;
};

export default async function Ajustes({ searchParams }: { searchParams: Promise<{ aviso?: string; prueba?: string; ok?: string }> }) {
  const { aviso, prueba, ok } = await searchParams;
  const { supabase, corredor, usuario } = await sesionConCorredor();
  const [{ data: google }, { data: extra }, { data: mes }, { data: dias }] = await Promise.all([
    supabase.from("google_conexiones").select("correo, conectado_at, ultimo_error").eq("corredor_id", corredor.id).maybeSingle(),
    supabase.from("corredores").select("zonas_e24, precio_busqueda_min, precio_busqueda_max").eq("id", corredor.id).single(),
    supabase
      .from("uso_mensual")
      .select("mes, mensajes_total, llamadas_claude, costo_claude_usd, fotos_mejoradas")
      .order("mes", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("uso_diario").select("dia, mensajes, costo_claude_usd").order("dia", { ascending: false }).limit(7),
  ]);
  const busqueda = (extra ?? { zonas_e24: [], precio_busqueda_min: null, precio_busqueda_max: null }) as Corredor;
  const usados = (mes?.mensajes_total as number | undefined) ?? 0;

  return (
    <>
      <Volver href="/panel/mas" texto="Más" className="solo-telefono" />
      <header className="encabezado">
        <h1>Ajustes</h1>
      </header>
      <div className="ajustes">
        <Aviso texto={aviso} />

        <section className="tarjeta pila ajustes-grupo">
          <h2>Correo y calendario de Google</h2>
          {google ? (
            <>
              <p>
                Conectado con <strong>{google.correo as string}</strong>.
              </p>
              {google.ultimo_error ? (
                <p className="aviso">Google dejó de aceptar la conexión. Vuelve a conectarla.</p>
              ) : (
                <p className="suave">
                  La asistente lee los correos de clientes y te deja la respuesta lista en Gmail, pone tus visitas en tu calendario de Google (y le manda la
                  invitación al cliente si tiene correo), respeta lo que ya tienes ocupado y te manda el resumen del día por correo.
                </p>
              )}
              <div className="botones">
                {google.ultimo_error ? (
                  <a href="/api/google/conectar" className="boton primario">
                    Volver a conectar
                  </a>
                ) : null}
                <form action={desconectarGoogle}>
                  <button type="submit">Desconectar</button>
                </form>
              </div>
            </>
          ) : (
            <>
              <p className="suave">
                Conecta tu Gmail para que la asistente lea los correos de clientes, te deje la respuesta lista, ponga tus visitas en tu calendario de Google y
                te mande el resumen del día por correo.
              </p>
              <a data-patty="ajustes-google" href="/api/google/conectar" className="boton primario">
                Conectar Google
              </a>
            </>
          )}
        </section>

        <form action={guardarAjustes} className="pila ajustes-form">
          <section className="tarjeta pila ajustes-grupo">
            <h2>Tu asistente</h2>
            <label htmlFor="nombre_asistente">¿Cómo se llama?</label>
            <input
              data-patty="ajustes-nombre"
              id="nombre_asistente"
              name="nombre_asistente"
              type="text"
              maxLength={40}
              defaultValue={corredor.nombre_asistente ?? "Patty"}
            />
            <p className="suave">Es el nombre que ves en el botón de chat de cada página.</p>
            <label htmlFor="comision_pct">Tu comisión en ventas (% del precio)</label>
            <input
              data-patty="ajustes-comision"
              className="corto"
              id="comision_pct"
              name="comision_pct"
              type="number"
              min={0}
              max={20}
              step={0.5}
              defaultValue={corredor.comision_pct ?? 5}
            />
            <p className="suave">
              Con esto se calcula cuánto ganarías en cada venta. En los alquileres se calcula un mes de renta. Siempre puedes escribir la comisión real al
              cerrar.
            </p>
          </section>

          <section className="tarjeta pila ajustes-grupo">
            <h2>Respuestas</h2>
            <label className="interruptor">
              <span>
                <strong>La asistente contesta sola</strong>
                <span className="suave">Si está apagado, revisas cada respuesta antes de que salga.</span>
              </span>
              <input
                data-patty="ajustes-respuesta-automatica"
                type="checkbox"
                role="switch"
                name="respuesta_automatica"
                defaultChecked={corredor.respuesta_automatica}
              />
            </label>
            <p>
              <Link href="/panel/empezar/sola" className="enlace" data-patty="ajustes-ir-sola">
                ¿No sabes si ya está lista? Revísalo paso a paso
              </Link>
            </p>

            <label htmlFor="tono">Cómo escribe la asistente</label>
            <textarea
              id="tono"
              name="tono"
              data-patty="ajustes-tono"
              defaultValue={corredor.tono}
              placeholder="Ejemplo: cordial y profesional, trato de usted, mensajes cortos, sin emojis."
            />

            <label htmlFor="reglas">Temas que siempre te pasa a ti (uno por línea)</label>
            <textarea data-patty="ajustes-temas" id="reglas" name="reglas" rows={5} defaultValue={corredor.reglas_escalamiento.join("\n")} />
          </section>

          <section className="tarjeta pila ajustes-grupo">
            <h2>Plan del día</h2>
            <label htmlFor="hora_plan">Hora en que te llega</label>
            <input
              data-patty="ajustes-hora-plan"
              className="corto"
              id="hora_plan"
              name="hora_plan"
              type="time"
              defaultValue={corredor.hora_plan_dia.slice(0, 5)}
            />
          </section>

          <section className="tarjeta pila ajustes-grupo">
            <h2>Búsqueda de dueños</h2>
            <label htmlFor="zonas_e24">Zonas de Encuentra24 (una por línea, como en la dirección del sitio)</label>
            <textarea id="zonas_e24" name="zonas_e24" defaultValue={busqueda.zonas_e24.join("\n")} placeholder="san-jose-provincia-escazu" />
            <div className="fila">
              <div className="pila" style={{ flex: 1 }}>
                <label htmlFor="precio_min">Precio mínimo (USD)</label>
                <input id="precio_min" name="precio_min" type="number" inputMode="numeric" defaultValue={busqueda.precio_busqueda_min ?? ""} />
              </div>
              <div className="pila" style={{ flex: 1 }}>
                <label htmlFor="precio_max">Precio máximo (USD)</label>
                <input id="precio_max" name="precio_max" type="number" inputMode="numeric" defaultValue={busqueda.precio_busqueda_max ?? ""} />
              </div>
            </div>
          </section>

          <div className="ajustes-guardar">
            <BotonEnviar texto="Guardar cambios" pendiente="Guardando…" className="primario grande" />
          </div>
        </form>

        <section className="tarjeta pila ajustes-grupo">
          <h2>Uso del mes</h2>
          <div className="fila">
            <span>Mensajes de WhatsApp</span>
            <strong>
              {usados} de {corredor.tope_mensajes_mes}
            </strong>
          </div>
          <span className={`ajustes-barra${usados >= corredor.tope_mensajes_mes * 0.9 ? " alta" : ""}`} aria-hidden>
            <i style={{ width: `${Math.min(100, corredor.tope_mensajes_mes ? (usados / corredor.tope_mensajes_mes) * 100 : 0)}%` }} />
          </span>
          <div className="fila">
            <span>Fotos mejoradas</span>
            <strong>{(mes?.fotos_mejoradas as number | undefined) ?? 0}</strong>
          </div>
          {(dias ?? []).length > 0 && (
            <table className="uso">
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Mensajes</th>
                  <th>Costo IA (USD)</th>
                </tr>
              </thead>
              <tbody>
                {(dias ?? []).map((d) => (
                  <tr key={d.dia as string}>
                    <td>{fechaCorta(d.dia as string)}</td>
                    <td>{d.mensajes as number}</td>
                    <td>{Number(d.costo_claude_usd).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {corredor.whatsapp_phone_number_id && corredor.activo !== false && (
          <section className="tarjeta pila ajustes-grupo" id="probar-whatsapp">
            <h2>Probar WhatsApp</h2>
            <p className="suave">
              Manda un mensaje de prueba de Meta a este celular, para comprobar que la conexión funciona. Con el número de prueba, el celular tiene que estar
              registrado en Meta.
            </p>
            {prueba && (
              <p className={ok === "1" ? "aviso" : "aviso error"} role="status">
                {prueba}
              </p>
            )}
            <form action={probarWhatsApp} className="pila">
              <label htmlFor="telefono-prueba">Celular con código de país</label>
              <input id="telefono-prueba" name="telefono" type="tel" inputMode="tel" autoComplete="tel" placeholder="+506 8888 8888" required />
              <BotonEnviar texto="Mandar mensaje de prueba" pendiente="Enviando…" className="primario grande" />
            </form>
          </section>
        )}

        <section className="tarjeta pila ajustes-grupo">
          <h2>Cuenta</h2>
          <form action={salir} className="ajustes-cuenta">
            <span className="suave">Entraste como {usuario.email}</span>
            <button type="submit">Salir</button>
          </form>
        </section>
      </div>
    </>
  );
}
