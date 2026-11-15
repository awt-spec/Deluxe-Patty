import { textoFila, type FilaContable } from "@/lib/crm/contable";
import type { Moneda } from "@/lib/crm/dinero";

// Tabla de cifras al estilo contable (lib/crm/contable.ts): concepto a la izquierda, monto alineado a la derecha con
// números de ancho fijo, totales con raya arriba, restas en rojo y sumas en verde. Cada grupo es un bloque aparte.

export function TablaContable({ filas, moneda, titulo, className }: { filas: FilaContable[]; moneda: Moneda; titulo: string; className?: string }) {
  const grupos = (["operacion", "comision"] as const).map((g) => filas.filter((f) => f.grupo === g)).filter((g) => g.length);
  return (
    <table className={`cont-tabla${className ? ` ${className}` : ""}`}>
      <caption className="oculto">{titulo}</caption>
      {grupos.map((g, i) => (
        <tbody key={i}>
          {g.map((f) => (
            <tr key={f.concepto} className={`cont-${f.tipo}`}>
              <th scope="row">
                <span className="cont-concepto">{f.concepto}</span>
                {f.detalle && <span className="cont-detalle">{f.detalle}</span>}
              </th>
              <td className="cont-monto">{textoFila(f, moneda)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
