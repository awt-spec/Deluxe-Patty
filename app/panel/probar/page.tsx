import { Volver } from "../volver";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Chat } from "./chat";
import { EncabezadoPagina } from "../piezas";
import "./probar.css";

// Cada turno llama a Claude una o dos veces.
export const maxDuration = 300;

export default async function Probar() {
  const { corredor } = await sesionConCorredor();
  return (
    <>
      <Volver href="/panel/mas" texto="Más" />
      <EncabezadoPagina titulo="Probar la asistente" apoyo="Escríbele como si fueras un cliente. Nada se envía de verdad." />
      <div className="chat-con-ayuda">
        <div className="chat-centro">
          <Chat nombreCorredor={corredor.nombre_contacto} corredorId={corredor.id} />
        </div>
        <aside className="tarjeta pila ayuda-lateral solo-computadora" aria-label="Qué probar">
          <h2>Qué probar</h2>
          <ul className="pasos-ayuda">
            <li>Pregunta por una casa, como lo haría un cliente nuevo.</li>
            <li>Pide una visita: verás los horarios que ofrece según tu agenda.</li>
            <li>Habla de precio u ofertas: debe pasártelo a ti.</li>
            <li>Califica cada respuesta con el pulgar. Si no te gustó, dile cómo lo dirías tú y lo aprende.</li>
          </ul>
          <p className="suave">Usa tus casas, tu agenda y tus correcciones, pero no escribe nada en tus chats ni en tu agenda y no cuenta para el tope del mes. Solo lo que le enseñes al calificar queda en su cerebro.</p>
        </aside>
      </div>
    </>
  );
}
