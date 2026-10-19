import Link from "next/link";

// Paso a paso para instalar la extensión sin la tienda de Chrome (piloto). Palabras de todos los días.
export default function InstalarExtension() {
  return (
    <>
      <p>
        <Link href="/panel/duenos" className="suave">
          ← Dueños directos
        </Link>
      </p>
      <header className="encabezado">
        <h1>Buscar dueños desde Chrome</h1>
      </header>
      <p>
        Encuentra24 no deja que la asistente lea su página desde internet, pero sí desde tu Chrome. Por eso la búsqueda
        corre en tu computadora: una extensión abre Encuentra24 en una pestaña, lee los anuncios de tus zonas y los
        dueños aparecen aquí. Se instala una sola vez, en una computadora (no en el teléfono).
      </p>

      <h2>1. Bajar la extensión</h2>
      <div className="tarjeta pila">
        <a href="/extension/buscador-duenos.zip" className="boton primario grande" download>
          Bajar la extensión
        </a>
        <p className="suave">
          Abre el archivo que bajó (doble clic): queda una carpeta llamada <strong>buscador-duenos</strong>. Déjala en
          un lugar donde no la borres, por ejemplo en Documentos.
        </p>
      </div>

      <h2>2. Ponerla en Chrome</h2>
      <ol className="pila pasos">
        <li>
          En Chrome, escribe <strong>chrome://extensions</strong> en la barra de direcciones y presiona Enter.
        </li>
        <li>
          Arriba a la derecha, enciende <strong>Modo de desarrollador</strong>.
        </li>
        <li>
          Toca <strong>Cargar descomprimida</strong> y elige la carpeta <strong>buscador-duenos</strong>.
        </li>
        <li>
          Toca el ícono de la pieza de rompecabezas, junto a la barra de direcciones, y fija{" "}
          <strong>Buscador de dueños</strong> para tenerlo a mano.
        </li>
      </ol>

      <h2>3. Conectarla</h2>
      <p>
        Vuelve a <Link href="/panel/duenos">Dueños directos</Link>, toca <strong>Conectar la extensión</strong> y
        escribe el código en la extensión. Revisa que tus zonas estén en Más → Ajustes.
      </p>

      <h2>4. Buscar</h2>
      <p>
        Una vez por semana, abre la extensión y toca <strong>Buscar dueños</strong>. Tarda unos 5 minutos y puedes
        seguir usando Chrome. Si Encuentra24 pide verificar que eres una persona, la pestaña se pone al frente:
        resuélvelo y la búsqueda sigue sola.
      </p>
    </>
  );
}
