import { AvisoDeUnaVez } from "./aviso-de-una-vez";

/** Resultado de la última acción, que vuelve en ?aviso= (y luego se quita de la dirección: no se repite con "Atrás"). */
export function Aviso({ texto }: { texto?: string }) {
  return texto ? (
    <p className="aviso" role="status">
      {texto}
      <AvisoDeUnaVez />
    </p>
  ) : null;
}
