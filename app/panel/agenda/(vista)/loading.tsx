import { Esqueleto } from "../../esqueleto";

// En un grupo de rutas para no envolver las páginas [id] (ver app/panel/not-found.tsx).
export default function Cargando() {
  return <Esqueleto cifras={0} tipo="calendario" />;
}
