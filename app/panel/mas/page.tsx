import Link from "next/link";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { elegirCorredor } from "../acciones";

// Lo que no se usa todos los días: detrás de un solo botón, para que el menú quede en tres.
const OPCIONES = [
  { ruta: "/panel/probar", icono: "🧪", nombre: "Probar la asistente", detalle: "Escríbele como si fueras un cliente" },
  { ruta: "/panel/resumen", icono: "📋", nombre: "Resumen del día", detalle: "Visitas, clientes nuevos y avisos" },
  { ruta: "/panel/duenos", icono: "🔑", nombre: "Dueños directos", detalle: "La lista de cada lunes" },
  { ruta: "/panel/anuncios", icono: "📣", nombre: "Anuncios", detalle: "Textos listos y contactos que traen" },
  { ruta: "/panel/agenda/horario", icono: "🕘", nombre: "Mi horario", detalle: "Días y horas para enseñar casas" },
  { ruta: "/panel/ajustes", icono: "⚙️", nombre: "Ajustes", detalle: "Tono, temas que te pasa y uso del mes" },
];

export default async function Mas() {
  const { corredor, corredores } = await sesionConCorredor();
  return (
    <>
      <p>
        <Link href="/panel" className="suave">
          ← Chats
        </Link>
      </p>
      <header className="encabezado">
        <h1>Más</h1>
      </header>
      <nav className="mas-lista" aria-label="Más opciones">
        {OPCIONES.map((o) => (
          <Link key={o.ruta} href={o.ruta} className="boton">
            <span aria-hidden style={{ fontSize: "1.5rem" }}>
              {o.icono}
            </span>
            <span style={{ textAlign: "left" }}>
              {o.nombre}
              <span className="suave" style={{ display: "block", fontWeight: 400 }}>
                {o.detalle}
              </span>
            </span>
          </Link>
        ))}
      </nav>
      {corredores.length > 1 && (
        <form action={elegirCorredor} className="pila tarjeta" style={{ marginTop: 18 }}>
          <label htmlFor="corredor">Corredor (soporte)</label>
          <select id="corredor" name="corredor" defaultValue={corredor.id}>
            {corredores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <button type="submit">Ver</button>
        </form>
      )}
    </>
  );
}
