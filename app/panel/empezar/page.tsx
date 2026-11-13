import Link from "next/link";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { clavePasos } from "@/lib/panel/pasos";
import { datosPuesta, estadoPuesta } from "@/lib/panel/puesta";
import { Aviso } from "../aviso";
import { IconoFlecha } from "../iconos";
import { EncabezadoPagina } from "../piezas";
import { AsistentePasos, type PasoGuia } from "../pasos/asistente-pasos";
import { IlusCasas, IlusGoogle, IlusHorario, IlusPrecioFotos, IlusTemas, IlusTono } from "../pasos/ilustraciones";
import { FormTemas, FormTono } from "./formularios";

// Puesta en marcha: seis pasos para dejar lista a la asistente. Cada paso se marca solo con los datos reales (casas
// activas, precio y fotos, horario, tono, temas y Google), con las mismas reglas del Cerebro (lib/panel/puesta.ts).

export default async function Empezar({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const datos = await datosPuesta(supabase, corredor);
  const estado = estadoPuesta(datos);
  const asistente = corredor.nombre_asistente ?? "Patty";

  const pasos: PasoGuia[] = [
    {
      id: "casas",
      nombre: "Tus casas",
      titulo: "Cuéntale tus casas",
      ilustracion: <IlusCasas asistente={asistente} />,
      contenido: (
        <>
          <p className="pap-instruccion">
            {asistente} solo ofrece las casas que están en <strong>Mis casas</strong>. Cuéntale una con tus palabras y ella arma la ficha.
          </p>
          {datos.casas.length > 0 && (
            <p className="pap-nota">
              Tienes {datos.casas.length} {datos.casas.length === 1 ? "casa disponible" : "casas disponibles"}.
            </p>
          )}
          <Link href="/panel/propiedades/nueva" className="boton primario pap-accion" data-patty="empezar-agregar-casa">
            {datos.casas.length ? "Agregar otra casa" : "Agregar una casa"}
          </Link>
        </>
      ),
      ayuda: [
        { p: "Tengo muchas casas", r: <>Empieza por las tres que más te preguntan. Las demás las agregas cuando puedas.</> },
        { p: "Mis casas ya están en mi sitio web", r: <>Si tu sitio está conectado, llegan solas a Mis casas cada 10 minutos.</> },
      ],
    },
    {
      id: "fichas",
      nombre: "Precio y fotos",
      titulo: "Ponles precio y fotos",
      ilustracion: <IlusPrecioFotos />,
      contenido: (
        <>
          <p className="pap-instruccion">Sin precio ni fotos, {asistente} no puede contestar lo primero que preguntan los clientes.</p>
          {estado.incompletas.length > 0 ? (
            <ul className="pap-lista" data-patty="empezar-incompletas">
              {estado.incompletas.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <Link href={`/panel/propiedades/${c.id}${c.fotos === 0 ? "#fotos" : ""}`}>
                    <span>
                      <strong>{c.titulo}</strong>
                      <small>{[!c.precio ? "Falta el precio" : null, c.fotos === 0 ? "Faltan las fotos" : null].filter(Boolean).join(" · ")}</small>
                    </span>
                    <IconoFlecha tamano={20} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : datos.casas.length === 0 ? (
            <p className="pap-nota">Primero agrega una casa (paso 1).</p>
          ) : null}
          {estado.incompletas.length > 8 && <p className="pap-nota">Y {estado.incompletas.length - 8} más en Mis casas.</p>}
        </>
      ),
      ayuda: [{ p: "Las fotos pesan mucho", r: <>Súbelas desde el teléfono: se achican solas antes de subir.</> }],
    },
    {
      id: "horario",
      nombre: "Horario",
      titulo: "Dile cuándo enseñas casas",
      ilustracion: <IlusHorario />,
      contenido: (
        <>
          <p className="pap-instruccion">
            Toca <strong>Mañana</strong> o <strong>Tarde</strong> en cada día. {asistente} solo ofrece visitas en esas horas y nunca encima de otra.
          </p>
          <Link href="/panel/agenda/horario" className="boton primario pap-accion" data-patty="empezar-horario">
            Poner mi horario
          </Link>
        </>
      ),
      ayuda: [{ p: "Un día no puedo", r: <>En la Agenda, «Apartar tiempo» bloquea ese día o esas horas.</> }],
    },
    {
      id: "tono",
      nombre: "Cómo escribe",
      titulo: "Elige cómo escribe",
      ilustracion: <IlusTono asistente={asistente} />,
      contenido: <FormTono actual={corredor.tono ?? ""} />,
    },
    {
      id: "temas",
      nombre: "Qué te pasa",
      titulo: "Lo que te pasa a ti",
      ilustracion: <IlusTemas asistente={asistente} corredor={corredor.nombre_contacto ?? ""} />,
      contenido: (
        <>
          <p className="pap-instruccion">
            Hay temas que prefieres contestar tú. Cuando un cliente los toca, {asistente} no contesta: le dice que lo consulta y te avisa.
          </p>
          <FormTemas actuales={corredor.reglas_escalamiento ?? []} />
          <p className="pap-nota">
            También se cambian en <Link href="/panel/ajustes#reglas">Ajustes</Link>.
          </p>
        </>
      ),
    },
    {
      id: "google",
      nombre: "Google y probar",
      titulo: "Conecta Google y pruébala",
      ilustracion: <IlusGoogle />,
      siguiente: "Saltar este paso",
      contenido: (
        <>
          <p className="pap-instruccion">
            <strong>Opcional.</strong> Con tu Gmail, {asistente} te deja las respuestas a correos de clientes listas en Gmail y pone las visitas en tu
            calendario de Google.
          </p>
          {datos.google ? (
            <p className="pap-nota pap-nota-verde">Google ya está conectado.</p>
          ) : (
            <>
              <a href="/api/google/conectar" className="boton primario pap-accion" data-patty="empezar-google">
                Conectar Google
              </a>
              <p className="pap-nota">Google te pide permiso y te devuelve a Ajustes. Para seguir aquí, abre Más y luego Puesta en marcha.</p>
            </>
          )}
          <p className="pap-instruccion">
            <strong>Pruébala:</strong> escríbele como si fueras un cliente. Nada sale por WhatsApp.
          </p>
          <Link href="/panel/probar" className="boton pap-accion" data-patty="empezar-probar">
            Probar la asistente
          </Link>
        </>
      ),
      ayuda: [
        { p: "Google dice que la app no está verificada", r: <>Toca «Configuración avanzada» y luego «Ir a…». Es tu propio panel.</> },
        { p: "No uso Gmail", r: <>No pasa nada: salta este paso. Todo lo demás funciona igual.</> },
      ],
    },
  ];

  return (
    <div className="pasos-pagina">
      <EncabezadoPagina
        titulo="Puesta en marcha"
        apoyo={`${estado.listos} de ${estado.total} listos. Seis pasos para que ${asistente} conteste como tú; cada uno se marca solo cuando está hecho.`}
        atras={{ href: "/panel", texto: "Inicio" }}
      />
      <Aviso texto={aviso} />
      <AsistentePasos
        id="empezar"
        etiqueta={`Pasos para preparar a ${asistente}`}
        pasos={pasos}
        cumplidos={estado.hechos}
        clave={clavePasos("empezar", corredor.id)}
        porDatos
        final={{
          titulo: `${asistente} está lista`,
          contenido: (
            <>
              <p>Ya conoce tus casas, tu horario, cómo escribes y qué te toca a ti. Mientras tanto, cada respuesta te espera en Revisar antes de salir.</p>
              <div className="pap-final-grilla">
                <div className="pap-final-item">
                  <h3>¿Que conteste sola?</h3>
                  <p>Cuando veas que casi no le corriges nada, revisa paso a paso si ya está lista.</p>
                  <Link href="/panel/empezar/sola" className="boton primario" data-patty="empezar-ir-sola">
                    {corredor.respuesta_automatica ? "Ya contesta sola: ver" : "Revisarlo"}
                  </Link>
                </div>
                <div className="pap-final-item">
                  <h3>Enséñale lo de siempre</h3>
                  <p>Mascotas, formas de pago, parqueo: lo que más te preguntan.</p>
                  <Link href="/panel/cerebro#ensenar" className="boton">
                    Enseñarle
                  </Link>
                </div>
              </div>
            </>
          ),
        }}
      />
    </div>
  );
}
