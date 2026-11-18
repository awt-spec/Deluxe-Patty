import { MOTIVOS_PERDIDA, telefonoBonito, type Etapa } from "@/lib/crm/perfil";
import { cambiarEtapa, unirCliente } from "../../acciones";
import type { OtroCliente } from "./tipos";
import { BotonEnviar } from "../../../boton-enviar";

/** Lo de poco uso, plegado al final: marcarlo como perdido y unirlo con otro cliente. */
export function PlegadosDelFinal({ id, etapa, otros }: { id: string; etapa: Etapa; otros: OtroCliente[] }) {
  return (
    <div className="fc-mas">
      {etapa !== "perdido" && <MarcarPerdido id={id} />}
      <UnirConOtro id={id} otros={otros} />
    </div>
  );
}

function MarcarPerdido({ id }: { id: string }) {
  return (
    <details className="tarjeta fc-plegado">
      <summary>¿Ya no sigue? Marcarlo como perdido</summary>
      <form action={cambiarEtapa} className="fc-motivo">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="etapa" value="perdido" />
        <p className="suave">Toca por qué se perdió: así sabes qué mejorar. Si vuelve, lo cambias de etapa.</p>
        <div className="fc-botones-motivo">
          {MOTIVOS_PERDIDA.map((m) => (
            <BotonEnviar key={m} texto={m} pendiente={m} name="motivo" value={m} />
          ))}
        </div>
      </form>
    </details>
  );
}

function UnirConOtro({ id, otros }: { id: string; otros: OtroCliente[] }) {
  return (
    <details className="tarjeta fc-plegado">
      <summary>¿Es la misma persona que otro cliente?</summary>
      <form action={unirCliente} className="fc-form">
        <input type="hidden" name="id" value={id} />
        <label htmlFor="otro">Unir con</label>
        <select id="otro" name="otro" required defaultValue="">
          <option value="" disabled>
            Elige el otro cliente
          </option>
          {otros.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre ?? telefonoBonito(o.telefono)} · {telefonoBonito(o.telefono)}
            </option>
          ))}
        </select>
        <p className="suave">Sus chats, visitas e historia pasan a este cliente y se completan los datos que falten. Su teléfono queda en las notas.</p>
        <BotonEnviar texto="Unir" pendiente="Uniendo…" />
      </form>
    </details>
  );
}
