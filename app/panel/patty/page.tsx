import { sesionConCorredor } from "@/lib/panel/sesion";
import { PattyPagina } from "../patty";

// Patty en su propia pantalla: el chat del corredor con su asistente, a todo lo alto, como en WhatsApp.
export default async function PaginaPatty() {
  const { corredor } = await sesionConCorredor();
  return <PattyPagina nombre={corredor.nombre_asistente ?? "Patty"} corredor={corredor.id} />;
}
