"use client";

import { useState } from "react";
import { leerCifra } from "@/lib/crm/dinero";
import { aTokens, cifraTokens } from "@/lib/ia/tokens";

// Campo de un tope en dólares con su equivalente en tokens al lado, mientras se escribe (1 dólar = 100 tokens,
// lib/ia/tokens.ts). Se guarda en dólares, como siempre; los tokens son lo que ve el corredor.

export function CampoUsd({
  etiqueta,
  name,
  defaultValue,
  placeholder,
  required,
  periodo,
  /** Tope de la plataforma: lo que vale si el campo queda vacío. */
  respaldo,
}: {
  etiqueta: string;
  name: string;
  defaultValue: number | string;
  placeholder?: string;
  required?: boolean;
  periodo: "día" | "mes";
  respaldo?: number;
}) {
  const [valor, setValor] = useState(String(defaultValue ?? ""));
  const n = leerCifra(valor.trim());
  let texto: string;
  if (n === "invalido") texto = "No se entiende el monto";
  else if (n === null) texto = respaldo !== undefined ? `Vacío: usa el de la plataforma (${cifraTokens(aTokens(respaldo))} tokens al ${periodo})` : "";
  else if (n === 0) texto = "= 0 tokens: IA apagada";
  else texto = `= ${cifraTokens(aTokens(n))} tokens al ${periodo}`;
  return (
    <label>
      {etiqueta}
      <input name={name} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={placeholder} required={required} />
      <small className="adm-suave adm-tokens" aria-live="polite">
        {texto}
      </small>
    </label>
  );
}
