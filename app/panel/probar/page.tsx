import { Volver } from "../volver";
import Link from "next/link";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Chat } from "./chat";

// Cada turno llama a Claude una o dos veces.
export const maxDuration = 300;

export default async function Probar() {
  const { corredor } = await sesionConCorredor();
  return (
    <>
      <Volver href="/panel/mas" texto="Más" />
      <header className="encabezado">
        <h1>Probar la asistente</h1>
      </header>
      <p className="suave">Escríbele como si fueras un cliente. Nada se envía de verdad.</p>
      <Chat nombreCorredor={corredor.nombre_contacto} />
    </>
  );
}
