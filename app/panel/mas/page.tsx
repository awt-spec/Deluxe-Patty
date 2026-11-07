import { Volver } from "../volver";
import Link from "next/link";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { elegirCorredor, salir } from "../acciones";
import {
  IconoAjustes,
  IconoAnuncio,
  IconoFlecha,
  IconoIdea,
  IconoLlave,
  IconoProbar,
  IconoSalir,
} from "../iconos";

// Lo que no se usa todos los días. Lo que ya tiene su pestaña (agenda, horario, clientes) no se repite aquí.
const GRUPOS = [
  [{ ruta: "/panel/cerebro", Icono: IconoIdea, nombre: "Cerebro de la asistente", detalle: "Lo que sabe y lo que te pregunta" }],
  [
    { ruta: "/panel/duenos", Icono: IconoLlave, nombre: "Dueños directos", detalle: "Casas que venden sus dueños" },
    { ruta: "/panel/anuncios", Icono: IconoAnuncio, nombre: "Anuncios", detalle: "Tus anuncios de Encuentra24" },
  ],
  [
    { ruta: "/panel/probar", Icono: IconoProbar, nombre: "Probar la asistente", detalle: "Escríbele como un cliente" },
    { ruta: "/panel/ajustes", Icono: IconoAjustes, nombre: "Ajustes", detalle: "Cómo contesta la asistente" },
  ],
];

export default async function Mas() {
  const { corredor, corredores, usuario } = await sesionConCorredor();
  return (
    <>
      <Volver href="/panel" texto="Chats" />
      <header className="encabezado">
        <h1>Más</h1>
      </header>
      <nav aria-label="Más opciones" className="mas-grupos">
        {GRUPOS.map((grupo, i) => (
          <ul key={i} className="opciones">
            {grupo.map((o) => (
              <li key={o.ruta}>
                <Link href={o.ruta} data-patty={`mas-${o.ruta.split("/").pop()}`}>
                  <span className="opcion-icono">
                    <o.Icono />
                  </span>
                  <span className="opcion-texto">
                    {o.nombre}
                    <span className="suave">{o.detalle}</span>
                  </span>
                  <span className="opcion-flecha">
                    <IconoFlecha tamano={20} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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

      <form action={salir} className="opciones">
        <button type="submit" className="opcion-salir">
          <span className="opcion-icono">
            <IconoSalir />
          </span>
          <span className="opcion-texto">
            Salir
            {usuario.email && <span className="suave">{usuario.email}</span>}
          </span>
        </button>
      </form>
    </>
  );
}
