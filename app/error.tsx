"use client";

// Pantalla de error en palabras de todos los días, en vez de la de Next en inglés. Abajo, en chico, el
// detalle técnico para soporte: en el navegador es el mensaje del error; si vino del servidor, solo su
// código (digest), porque Next no manda el mensaje.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const detalle = error.digest ? `servidor ${error.digest}` : `${error.name}: ${error.message}`.slice(0, 300);
  return (
    <main className="panel">
      <h1>Algo no cargó bien</h1>
      <p>Vuelve a intentarlo. Si sigue pasando, avísale a soporte con el detalle de abajo.</p>
      <div className="botones" style={{ marginTop: 16 }}>
        <button type="button" className="primario grande" onClick={() => reset()}>
          Volver a intentar
        </button>
        <a href="/panel" className="boton grande">
          Ir a Chats
        </a>
      </div>
      <p className="suave" style={{ marginTop: 24, overflowWrap: "anywhere" }}>
        Detalle: {detalle}
      </p>
    </main>
  );
}
