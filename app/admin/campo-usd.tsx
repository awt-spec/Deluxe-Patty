"use client";

import { useId, useState } from "react";
import { leerCifra } from "@/lib/crm/dinero";

// Campo de un tope en dólares con su equivalente en energía al lado, mientras se escribe: el monto es el 100 % de la
// energía de la asistente (lib/ia/energia.ts). Se guarda en dólares, como siempre; la energía es lo que ve el corredor.

export function CampoUsd({
  etiqueta,
  name,
  defaultValue,
  placeholder,
  required,
  periodo,
  /** Tope de la plataforma: lo que vale si el campo queda vacío. */
  respaldo,
  asistente,
}: {
  etiqueta: string;
  name: string;
  defaultValue: number | string;
  placeholder?: string;
  required?: boolean;
  periodo: "día" | "mes";
  respaldo?: number;
  /** Nombre de la asistente del corredor; sin él, "la asistente". */
  asistente?: string | null;
}) {
  const de = asistente?.trim() ? `de ${asistente.trim()}` : "de la asistente";
  const [valor, setValor] = useState(String(defaultValue ?? ""));
  const id = useId();
  const n = leerCifra(valor.trim());
  let texto: string;
  if (n === "invalido") texto = "No se entiende el monto";
  else if (n === null) texto = respaldo !== undefined ? `Vacío: usa el de la plataforma ($${respaldo} al ${periodo} = 100 % de energía ${de})` : "";
  else if (n === 0) texto = "= 0 % de energía: IA apagada";
  else texto = `= 100 % de energía ${de} al ${periodo}`;
  return (
    <div className="ad-campo">
      <label htmlFor={id}>{etiqueta}</label>
      <span className="ad-campo-prefijo">
        <span aria-hidden>$</span>
        <input
          id={id}
          name={name}
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={placeholder}
          required={required}
          aria-invalid={n === "invalido" || undefined}
          aria-describedby={`${id}-energia`}
        />
      </span>
      <small id={`${id}-energia`} className={`ad-energia-ayuda${n === "invalido" ? " mal" : n === 0 ? " poco" : ""}`} aria-live="polite">
        {texto}
      </small>
    </div>
  );
}
