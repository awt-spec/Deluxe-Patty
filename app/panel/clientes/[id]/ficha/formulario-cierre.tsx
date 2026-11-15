"use client";

import { useState, useTransition } from "react";
import { etiquetaComision, previaComision } from "@/lib/crm/cierre";
import { montoContable } from "@/lib/crm/contable";
import { monedaDe, type Moneda } from "@/lib/crm/dinero";
import { guardarCierre } from "../../acciones";

// Casa, precio, moneda y comisión del cierre (guardarCierre): para anotarlo o, ya cerrado, corregirlo. Los campos son
// del estado de React y el formulario se manda a mano (no con `action`), así un aviso de la validación no borra lo que
// el corredor escribió (React vacía los formularios con `action` al terminar). Debajo de la comisión se ve lo que se
// va a guardar ("= $59.000,00 (5 % del precio)"), con las mismas reglas que el servidor (lib/crm/cierre.ts).

export interface CasaDelCierre {
  id: string;
  titulo: string;
  operacion: string | null;
}

export function FormularioCierre(p: {
  formId?: string;
  titulo?: string;
  clienteId: string;
  prefijo: string;
  /** Lo que buscaba el cliente: decide venta o alquiler si no se elige casa. */
  operacionCliente: string | null;
  comisionPct: number;
  todas: CasaDelCierre[];
  casaId: string;
  precio: number | null;
  moneda: string;
  /** Al corregir: el cierre de ahora. La comisión no se precarga: vacía, se queda o se recalcula. */
  actual?: { precio: number | null; moneda: string | null; comision: number | null; operacion: string | null } | null;
  boton: string;
}) {
  const [casa, setCasa] = useState(p.casaId);
  const [precio, setPrecio] = useState(p.precio !== null && p.precio !== undefined ? String(p.precio) : "");
  const [moneda, setMoneda] = useState<Moneda>(monedaDe(p.moneda));
  const [comision, setComision] = useState("");
  const [guardando, empezar] = useTransition();
  const id = (k: string) => `${p.prefijo}-${k}`;
  const operacion = p.todas.find((c) => c.id === casa)?.operacion ?? p.operacionCliente;
  const alquiler = operacion === "alquiler";
  const previa = previaComision({ precio, comision, moneda, comisionPct: p.comisionPct, operacion, actual: p.actual });
  const actual = p.actual?.comision !== null && p.actual?.comision !== undefined ? montoContable(p.actual.comision, monedaDe(p.actual.moneda)) : null;

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    empezar(async () => {
      await guardarCierre(datos);
    });
  };

  return (
    <form onSubmit={enviar} className="fc-form" id={p.formId}>
      {p.titulo && <h2>{p.titulo}</h2>}
      <input type="hidden" name="id" value={p.clienteId} />
      <label htmlFor={id("casa")}>Casa</label>
      <select id={id("casa")} name="casa" value={casa} onChange={(e) => setCasa(e.target.value)}>
        <option value="">Ninguna de mis casas</option>
        {p.todas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.titulo}
          </option>
        ))}
      </select>
      <label htmlFor={id("precio")}>{alquiler ? "Renta mensual" : "Precio final"}</label>
      <div className="fc-monto">
        <input id={id("precio")} name="precio" type="text" inputMode="decimal" required value={precio} onChange={(e) => setPrecio(e.target.value)} />
        <select name="moneda" aria-label="Moneda" value={moneda} onChange={(e) => setMoneda(monedaDe(e.target.value))}>
          <option value="USD">Dólares</option>
          <option value="CRC">Colones</option>
        </select>
      </div>
      <label htmlFor={id("comision")}>{etiquetaComision(p.comisionPct, operacion)}</label>
      <input
        id={id("comision")}
        name="comision"
        type="text"
        inputMode="decimal"
        value={comision}
        onChange={(e) => setComision(e.target.value)}
        placeholder={alquiler ? "Un mes de renta" : `${p.comisionPct} % o el monto`}
        aria-describedby={id("comision-previa")}
      />
      {actual && (
        <small className="fc-comision-ahora suave">Ahora: {actual} — vacía la recalcula si cambias el precio, la moneda o venta/alquiler</small>
      )}
      <small id={id("comision-previa")} className={`fc-comision-previa${previa?.error ? " error" : ""}`} aria-live="polite">
        {previa?.texto ?? ""}
      </small>
      <button type="submit" className="primario" disabled={guardando}>
        {guardando ? "Guardando…" : p.boton}
      </button>
    </form>
  );
}
