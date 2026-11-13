import { Aviso } from "../../aviso";
import { Volver } from "../../volver";
import { agregarCliente } from "../acciones";
import "../../propiedades/formulario-movil.css";

// Agregar a mano un cliente que no llegó por WhatsApp: un referido, alguien que llamó o que conoció en
// persona. Solo lo necesario: teléfono, nombre y de dónde viene.

export default async function NuevoCliente({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  return (
    <>
      <Volver href="/panel/clientes" texto="Clientes" />
      <header className="encabezado">
        <div>
          <h1>Agregar cliente</h1>
          <p className="suave">Para alguien que no te escribió por WhatsApp.</p>
        </div>
      </header>
      <Aviso texto={aviso} />
      <form action={agregarCliente} className="tarjeta pila form-cliente">
        <label htmlFor="telefono">Teléfono</label>
        <input id="telefono" name="telefono" type="tel" inputMode="tel" required placeholder="8888 8888" autoComplete="off" enterKeyHint="next" />
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" name="nombre" type="text" placeholder="Laura Méndez" autoComplete="off" enterKeyHint="next" />
        <fieldset className="opciones">
          <legend>¿Cómo llegó?</legend>
          <label>
            <input type="radio" name="origen" value="referido" defaultChecked /> Me lo recomendaron
          </label>
          <label>
            <input type="radio" name="origen" value="otro" /> Me llamó o lo conocí en persona
          </label>
        </fieldset>
        <label htmlFor="notas">Lo que quieras recordar (opcional)</label>
        <textarea id="notas" name="notas" placeholder="Busca casa en Escazú para su familia" />
        <button type="submit" className="primario">
          Guardar cliente
        </button>
      </form>
    </>
  );
}
