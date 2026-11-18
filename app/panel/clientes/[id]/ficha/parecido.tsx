import { telefonoBonito } from "@/lib/crm/perfil";
import { unirCliente } from "../../acciones";
import type { OtroCliente } from "./tipos";
import { BotonEnviar } from "../../../boton-enviar";

/** Aviso arriba cuando otro cliente parece la misma persona (mismo nombre o correo), con "Unirlos". */
export function AvisoParecido({ id, parecidos }: { id: string; parecidos: OtroCliente[] }) {
  if (parecidos.length === 0) return null;
  const otro = parecidos[0];
  return (
    <form action={unirCliente} className="aviso parecido">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="otro" value={otro.id} />
      <span>
        Parece la misma persona que <strong>{otro.nombre ?? telefonoBonito(otro.telefono)}</strong> ({telefonoBonito(otro.telefono)}).
      </span>
      <BotonEnviar texto="Unirlos" pendiente="Uniendo…" />
    </form>
  );
}
