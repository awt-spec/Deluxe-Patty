import Link from "next/link";
import type { FilaAdmin } from "@/lib/admin/datos";
import { estadoCorredor, estadoWhatsApp } from "@/lib/admin/atencion";
import { IconoAsistente, IconoChats, IconoEnviar, IconoEscudo, IconoInfo, IconoRayo } from "../../panel/iconos";
import { darAcceso, guardarDatosCorredor, guardarTopesCorredor, probarWhatsApp, quitarAcceso } from "../acciones";
import { CampoUsd } from "../campo-usd";
import { Avatar, Barra, EXPLICA_ENERGIA, Encabezado, EnergiaMes, Nota, Pildora, Tarjeta, Vacio, hace, usd } from "../ui";

// Pantalla de un corredor (vista pura): cabecera con su estado, Datos y WhatsApp + Asistente (un solo formulario:
// las casillas sin marcar se guardan como "no"), Probar WhatsApp, IA y energía, y quién entra. Los nombres de los
// campos son los que leen las acciones de app/admin/acciones.ts.

export interface DatosCorredor {
  fila: FilaAdmin;
  plataforma: { topeDia: number; topeMes: number };
  miembros: { user_id: string; rol: string; correo: string | null }[];
  ahora?: Date;
}

function Campo({ etiqueta, ayuda, id, children }: { etiqueta: string; ayuda: React.ReactNode; id: string; children: React.ReactNode }) {
  return (
    <div className="ad-campo">
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      <small id={`${id}-ayuda`}>{ayuda}</small>
    </div>
  );
}

function Interruptor({ name, defaultChecked, titulo, ayuda }: { name: string; defaultChecked: boolean; titulo: string; ayuda: string }) {
  return (
    <label className="ad-interruptor">
      <input type="checkbox" role="switch" name={name} defaultChecked={defaultChecked} />
      <span className="ad-interruptor-pista" aria-hidden />
      <span className="ad-interruptor-texto">
        <strong>{titulo}</strong>
        <small>{ayuda}</small>
      </span>
    </label>
  );
}

const desglose = (u: FilaAdmin["hoy"]) =>
  `Claude ${usd(u.costoClaude)} (${u.llamadas} llamadas) · Imágenes ${usd(u.costoImagenes)} (${u.imagenes}) · Audio ${usd(u.costoAudio)} (${Math.round(u.segundosAudio / 60)} min)`;

export function VistaCorredor({ fila: f, plataforma, miembros, ahora = new Date() }: DatosCorredor) {
  const c = f.c;
  const id = c.id;
  const estado = estadoCorredor(f);
  const wa = estadoWhatsApp(f);
  const puedeProbar = !!c.whatsapp_phone_number_id && c.activo;

  return (
    <>
      <Encabezado
        migas={[{ href: "/admin/corredores", nombre: "Corredores" }]}
        antes={<Avatar nombre={c.nombre} tamano={56} />}
        titulo={c.nombre}
        descripcion={
          <span className="ad-encabezado-estado">
            <Pildora tono={estado.tono}>{estado.texto}</Pildora>
            <Pildora tono={wa.tono}>WhatsApp: {wa.texto.toLowerCase()}</Pildora>
            <span className="ad-suave">
              {c.nombre_contacto} · último mensaje {hace(f.ultimoEntrante, ahora)}
            </span>
          </span>
        }
        acciones={
          <a href="#probar" className="ad-boton primario">
            <IconoEnviar tamano={18} /> Probar WhatsApp
          </a>
        }
      />

      <nav className="ad-indice" aria-label="Secciones de este corredor">
        <a href="#datos">WhatsApp</a>
        <a href="#asistente">Asistente</a>
        <a href="#probar">Probar</a>
        <a href="#ia">IA y energía</a>
        <a href="#accesos">Accesos</a>
      </nav>

      <form action={guardarDatosCorredor} className="ad-pila">
        <input type="hidden" name="id" value={id} />
        <Tarjeta id="datos" titulo="Datos y WhatsApp" icono={<IconoChats tamano={20} />} descripcion="Cómo se conecta este corredor con Meta y a qué celular le llegan los avisos.">
          <div className="ad-campos">
            <Campo id="phone_number_id" etiqueta="Phone number ID" ayuda="Solo números. Lo da Meta en Configuración de la API; con él el sistema sabe de quién es cada mensaje.">
              <input
                id="phone_number_id"
                name="phone_number_id"
                defaultValue={c.whatsapp_phone_number_id ?? ""}
                inputMode="numeric"
                pattern="\d{5,25}"
                placeholder="Ej. 123456789012345"
                aria-describedby="phone_number_id-ayuda"
              />
            </Campo>
            <Campo id="whatsapp_numero" etiqueta="Número de la asistente" ayuda="El que ven los clientes, con código de país. Va en los enlaces wa.me. Con el número de prueba de Meta, déjalo vacío.">
              <input id="whatsapp_numero" name="whatsapp_numero" defaultValue={c.whatsapp_numero ?? ""} type="tel" placeholder="+506 8888 8888" aria-describedby="whatsapp_numero-ayuda" />
            </Campo>
            <Campo id="whatsapp_corredor" etiqueta="Celular del corredor" ayuda="Su WhatsApp personal, con código de país. Ahí llegan el plan del día y los avisos, y con él se le reconoce cuando escribe.">
              <input id="whatsapp_corredor" name="whatsapp_corredor" defaultValue={c.whatsapp_corredor ?? ""} type="tel" placeholder="+506 8888 8888" aria-describedby="whatsapp_corredor-ayuda" />
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta id="asistente" titulo="Asistente" icono={<IconoAsistente tamano={20} />} descripcion="Si la asistente contesta sola y si la cuenta está encendida.">
          <div className="ad-interruptores">
            <Interruptor
              name="respuesta_automatica"
              defaultChecked={c.respuesta_automatica}
              titulo="Responder sola"
              ayuda="Apagado es el piloto en sombra: la asistente redacta y el corredor aprueba cada respuesta."
            />
            <Interruptor name="activo" defaultChecked={c.activo} titulo="Cuenta activa" ayuda="Un corredor inactivo no manda nada por WhatsApp (es lo que usa la demo)." />
          </div>
        </Tarjeta>

        <div className="ad-barra-guardar">
          <span className="ad-suave">Los cambios de WhatsApp y Asistente se guardan juntos.</span>
          <button type="submit" className="ad-boton primario">
            Guardar datos
          </button>
        </div>
      </form>

      <Tarjeta
        id="probar"
        titulo="Probar WhatsApp"
        icono={<IconoEnviar tamano={20} />}
        className="ad-destacada"
        descripcion={
          <>
            Manda la plantilla <code>hello_world</code> de Meta a un celular para comprobar la llave y el número. Con el número de prueba, el celular tiene que
            estar verificado en la lista de Meta.
          </>
        }
      >
        <form action={probarWhatsApp} className="ad-form-linea">
          <input type="hidden" name="id" value={id} />
          <div className="ad-campo">
            <label htmlFor="probar-telefono">Celular que recibe la prueba</label>
            <input id="probar-telefono" name="telefono" type="tel" inputMode="tel" placeholder="+506 8888 8888" required disabled={!puedeProbar} aria-describedby="probar-ayuda" />
          </div>
          <button type="submit" className="ad-boton primario" disabled={!puedeProbar} aria-describedby="probar-ayuda">
            <IconoEnviar tamano={18} /> Mandar prueba
          </button>
        </form>
        <p id="probar-ayuda" className="ad-ayuda">
          {!c.whatsapp_phone_number_id ? (
            <>Primero pon el Phone number ID en Datos y WhatsApp.</>
          ) : !c.activo ? (
            <>La cuenta está inactiva: un corredor inactivo no manda nada por WhatsApp.</>
          ) : (
            <>
              ¿Meta rechaza el envío? Mira el estado del número en <Link href="/admin/whatsapp">WhatsApp</Link>.
            </>
          )}
        </p>
      </Tarjeta>

      <Tarjeta id="ia" titulo="IA y energía" icono={<IconoRayo tamano={20} />} descripcion="Lo que gastó hoy y este mes, y los topes que lo frenan.">
        <div className="ad-usos">
          <div className="ad-uso">
            <span className="ad-uso-titulo">Hoy</span>
            <strong>
              {usd(f.gastoHoy)} <span className="ad-suave">de {usd(f.topeDia)}</span>
            </strong>
            <Barra gasto={f.gastoHoy} tope={f.topeDia} etiqueta="Gasto de IA de hoy" />
            <small>{desglose(f.hoy)}</small>
          </div>
          <div className="ad-uso">
            <span className="ad-uso-titulo">Este mes</span>
            <EnergiaMes gastoMes={f.gastoMes} topeMes={f.topeMes} />
            <small>{desglose(f.mes)}</small>
          </div>
          <div className="ad-uso">
            <span className="ad-uso-titulo">Mensajes del mes</span>
            <strong>
              {f.mensajesMes.toLocaleString("es-CR")} <span className="ad-suave">de {c.tope_mensajes_mes.toLocaleString("es-CR")}</span>
            </strong>
            <Barra gasto={f.mensajesMes} tope={c.tope_mensajes_mes} etiqueta="Mensajes del mes" />
            <small>Aviso a los {c.aviso_mensajes_mes.toLocaleString("es-CR")}.</small>
          </div>
        </div>

        <form action={guardarTopesCorredor} className="ad-subform">
          <input type="hidden" name="id" value={id} />
          <h3>Topes propios</h3>
          <div className="ad-campos">
            <CampoUsd
              etiqueta="Tope por día (USD)"
              name="tope_dia"
              defaultValue={c.tope_ia_dia_usd ?? ""}
              placeholder={`${plataforma.topeDia} (plataforma)`}
              periodo="día"
              asistente={c.nombre_asistente}
              respaldo={plataforma.topeDia}
            />
            <CampoUsd
              etiqueta="Tope por mes (USD)"
              name="tope_mes"
              defaultValue={c.tope_ia_mes_usd ?? ""}
              placeholder={`${plataforma.topeMes} (plataforma)`}
              periodo="mes"
              asistente={c.nombre_asistente}
              respaldo={plataforma.topeMes}
            />
            <Campo id="tope_mensajes" etiqueta="Tope de mensajes por mes" ayuda="Número entero de 1 a 100.000.">
              <input id="tope_mensajes" name="tope_mensajes" defaultValue={c.tope_mensajes_mes} inputMode="numeric" pattern="\d+" required aria-describedby="tope_mensajes-ayuda" />
            </Campo>
            <Campo id="aviso_mensajes" etiqueta="Avisar a los" ayuda="No puede ser mayor que el tope.">
              <input id="aviso_mensajes" name="aviso_mensajes" defaultValue={c.aviso_mensajes_mes} inputMode="numeric" pattern="\d+" required aria-describedby="aviso_mensajes-ayuda" />
            </Campo>
          </div>
          <div className="ad-interruptores">
            <Interruptor name="imagenes" defaultChecked={c.imagenes_activas} titulo="Puede generar imágenes" ayuda="Mejorar, amueblar y quitar objetos de fotos con IA." />
          </div>
          <Nota>
            <IconoInfo tamano={18} />
            <span>
              {EXPLICA_ENERGIA} Vacío usa el de la plataforma; 0 apaga la IA de este corredor. Los topes cuentan Claude, imágenes y transcripción de audio.
              Al llegar al tope de mensajes del mes la IA no contesta: el chat queda para el corredor.
            </span>
          </Nota>
          <div className="ad-acciones-form">
            <button type="submit" className="ad-boton">
              Guardar topes
            </button>
          </div>
        </form>
      </Tarjeta>

      <Tarjeta id="accesos" titulo="Quién entra a este corredor" icono={<IconoEscudo tamano={20} />} descripcion="Usuarios que ven el panel de este corredor.">
        {miembros.length === 0 ? (
          <Vacio icono={<IconoEscudo tamano={28} />} titulo="Nadie tiene acceso todavía">
            Dale acceso a un correo abajo.
          </Vacio>
        ) : (
          <ul className="ad-personas">
            {miembros.map((mi) => (
              <li key={mi.user_id}>
                <Avatar nombre={mi.correo ?? "?"} tamano={36} />
                <span className="ad-persona-nombre">{mi.correo ?? "(usuario borrado)"}</span>
                <Pildora tono={mi.rol === "soporte" ? "info" : "bien"} punto={false}>
                  {mi.rol === "soporte" ? "Soporte" : "Corredor"}
                </Pildora>
                <form action={quitarAcceso}>
                  <input type="hidden" name="corredor_id" value={id} />
                  <input type="hidden" name="user_id" value={mi.user_id} />
                  <button type="submit" className="ad-boton chico peligro">
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={darAcceso} className="ad-form-linea ad-separada">
          <input type="hidden" name="corredor_id" value={id} />
          <div className="ad-campo crece">
            <label htmlFor="dar-correo">Dar acceso a un correo que ya tiene usuario</label>
            <input id="dar-correo" name="correo" type="email" placeholder="correo@ejemplo.com" required />
          </div>
          <div className="ad-campo">
            <label htmlFor="dar-rol">Rol</label>
            <select id="dar-rol" name="rol" defaultValue="corredor">
              <option value="corredor">Corredor</option>
              <option value="soporte">Soporte</option>
            </select>
          </div>
          <button type="submit" className="ad-boton">
            Dar acceso
          </button>
        </form>
        <p className="ad-ayuda">
          ¿El correo no tiene usuario? <Link href="/admin/accesos">Créalo en Accesos</Link>.
        </p>
      </Tarjeta>
    </>
  );
}
