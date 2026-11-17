// Mientras carga una pantalla de /admin (WhatsApp consulta a Meta en vivo y puede tardar): esqueleto con la forma de
// la página, sin texto que cambie de lugar.
export default function Cargando() {
  return (
    <div className="ad-esqueleto" role="status" aria-live="polite">
      <span className="ad-oculto">Cargando…</span>
      <span className="ad-hueso titulo" />
      <span className="ad-hueso linea" />
      <div className="ad-kpis">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="ad-hueso kpi" />
        ))}
      </div>
      <span className="ad-hueso tarjeta" />
      <span className="ad-hueso tarjeta corta" />
    </div>
  );
}
