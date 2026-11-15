import { Esqueleto } from "../../esqueleto";

// Esqueleto de carga solo de esta pantalla. No va en app/panel/loading.tsx: un loading de un nivel de arriba también
// envolvería las páginas [id] y Next mandaría 200 antes de que la página llame a notFound() (ver app/panel/not-found.tsx).
export default function Cargando() {
  return <Esqueleto />;
}
