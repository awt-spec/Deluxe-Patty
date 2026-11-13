import manifiesto from "@/extension/manifest.json";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Volver } from "../../volver";
import { EncabezadoPagina } from "../../piezas";
import { estadoDelServidor } from "../estado-servidor";
import { InstalarExtension } from "./asistente";
import "./extension.css";

// Instalar la extensión sin la tienda de Chrome: un paso a la vez, con dibujos de lo que se ve en Chrome, y la
// conexión sola (el content script de la extensión recibe aquí un código de un solo uso). Ver asistente.tsx.
export default async function PaginaInstalar() {
  const s = await estadoDelServidor(await sesionConCorredor());
  return (
    <div className="ext-pagina">
      <Volver href="/panel/duenos" texto="Dueños directos" />
      <EncabezadoPagina
        titulo="Instalar la extensión"
        apoyo="Encuentra24 solo deja leer sus anuncios desde tu Chrome. La extensión busca dueños ahí por ti. Se instala una sola vez, en tu computadora."
      />
      <InstalarExtension servidor={{ conectada: s.conectada, ultimaBusquedaDias: s.ultimaBusquedaDias }} version={manifiesto.version} demo={s.demo} corredor={s.corredor} />
    </div>
  );
}
