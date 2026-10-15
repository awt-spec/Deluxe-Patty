/** Resultado de la última acción, que vuelve en ?aviso=. */
export function Aviso({ texto }: { texto?: string }) {
  return texto ? (
    <p className="aviso" role="status">
      {texto}
    </p>
  ) : null;
}
