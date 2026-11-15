import { plata } from "@/lib/crm/dinero";
import type { Etapa } from "@/lib/crm/perfil";
import { IconoAgenda, IconoCampana, IconoEstrella, IconoReloj } from "../../../iconos";
import { Cifra } from "../../../piezas";
import { DIAS_QUIETO } from "../que-sigue";
import { anclaDinero, numeroLlego, textoHechas, textoLlego, textoProximas, textoSinMovimiento, type CifraDinero } from "./reglas";

/** Las cifras de arriba: desde cuándo es cliente, días sin movimiento, visitas y el dinero (cierre, oferta o presupuesto). */
export function CifrasCliente({
  etapa,
  activo,
  diasCliente,
  diasSinMovimiento,
  hechas,
  proximas,
  dinero,
}: {
  etapa: Etapa;
  activo: boolean;
  diasCliente: number;
  diasSinMovimiento: number;
  hechas: number;
  proximas: number;
  dinero: CifraDinero | null;
}) {
  return (
    <div className="cifras fc-cifras">
      <Cifra numero={numeroLlego(diasCliente)} Icono={IconoReloj} tono="azul">
        {textoLlego(diasCliente)}
      </Cifra>
      <Cifra numero={diasSinMovimiento} Icono={IconoCampana} tono="ambar" alerta={activo && diasSinMovimiento >= DIAS_QUIETO}>
        {textoSinMovimiento(diasSinMovimiento)}
      </Cifra>
      <Cifra numero={hechas} Icono={IconoAgenda} tono="morado">
        {textoHechas(hechas)}
        {textoProximas(proximas)}
      </Cifra>
      {dinero && (
        <Cifra numero={plata(dinero.monto, dinero.moneda)} Icono={IconoEstrella} tono="verde" href={anclaDinero(etapa, dinero.que)}>
          {dinero.que}
        </Cifra>
      )}
    </div>
  );
}
