// Piezas comunes de /admin (solo presentación).
import { estadoEnergia } from "@/lib/ia/energia";

export const usd = (n: number) => `$${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fechaEn = (zona: string, d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(d);

/** Hace cuánto pasó algo, en palabras. */
export function hace(fecha: string | Date | null | undefined, ahora = new Date()): string {
  if (!fecha) return "nunca";
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(fecha).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
}

/** Resultado de la última acción: queda pegado arriba para que se vea aunque el botón esté abajo. */
export function Mensaje({ m, ok }: { m?: string; ok?: string }) {
  if (!m) return null;
  return (
    <p className={`adm-mensaje ${ok === "1" ? "bien" : "mal"}`} role="status">
      {m}
    </p>
  );
}

export function Barra({ gasto, tope }: { gasto: number; tope: number }) {
  const pct = tope > 0 ? Math.min(100, (gasto / tope) * 100) : 100;
  return (
    <span className={`adm-barra${pct >= 100 ? " lleno" : pct >= 80 ? " cerca" : ""}`} title={`${Math.round(pct)}% del tope`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Insignia({ tono = "gris", children }: { tono?: "verde" | "ambar" | "rojo" | "gris"; children: React.ReactNode }) {
  return <span className={`adm-insignia ${tono}`}>{children}</span>;
}

export function Cifra({ valor, etiqueta, tono }: { valor: React.ReactNode; etiqueta: string; tono?: "alerta" }) {
  return (
    <div className={`adm-cifra${tono ? ` ${tono}` : ""}`}>
      <strong>{valor}</strong>
      <span>{etiqueta}</span>
    </div>
  );
}

/** Energía del mes de un corredor (lo que él ve como batería): usada en %, con dólares usados de dólares del tope. */
export function EnergiaMes({ gastoMes, topeMes }: { gastoMes: number; topeMes: number }) {
  const e = estadoEnergia({ gastoMesUsd: gastoMes, topeMesUsd: topeMes });
  return (
    <span className="adm-uso-fila">
      <span>
        Energía usada <strong>{e.usado} %</strong>
        <span className="adm-suave">
          {" "}
          · {usd(gastoMes)} de {usd(topeMes)}
        </span>
        {e.nivel === "agotado" ? <em className="adm-rojo"> · agotada</em> : e.nivel === "poco" ? <em className="adm-ambar"> · queda poca</em> : null}
      </span>
      <Barra gasto={gastoMes} tope={topeMes} />
    </span>
  );
}

export const EXPLICA_ENERGIA = "El monto del mes es el 100 % de la energía de la asistente: el corredor ve una batería con lo que le queda. Se guarda en dólares.";
