// Lo que se ve mientras carga una pantalla del panel: la forma de lo que viene (título, cifras y la lista),
// en gris suave y sin texto, para que no parezca que la página se quedó en blanco.

export function Esqueleto({ cifras = 4, filas = 5, tipo = "lista" }: { cifras?: number; filas?: number; tipo?: "lista" | "tarjetas" | "calendario" }) {
  return (
    <div className="esqueleto" role="status" aria-live="polite">
      <span className="oculto">Cargando…</span>
      <div className="esqueleto-encabezado" aria-hidden>
        <span className="hueso titulo" />
        <span className="hueso linea corta" />
      </div>
      {cifras > 0 && (
        <div className="esqueleto-cifras" aria-hidden>
          {Array.from({ length: cifras }, (_, i) => (
            <span key={i} className="hueso cifra" />
          ))}
        </div>
      )}
      {tipo === "calendario" ? (
        <span className="hueso calendario" aria-hidden />
      ) : (
        <div className={tipo === "tarjetas" ? "esqueleto-tarjetas" : "esqueleto-lista"} aria-hidden>
          {Array.from({ length: filas }, (_, i) => (
            <span key={i} className="hueso fila" />
          ))}
        </div>
      )}
    </div>
  );
}
