// Piezas comunes de /admin (solo presentación, sin datos ni red): las usan las vistas de app/admin/vistas/.
import Link from "next/link";
import { estadoEnergia } from "@/lib/ia/energia";
import { iniciales, type Tono } from "@/lib/admin/atencion";
import { AvisoResultado } from "./aviso";

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

/** Resultado de la última acción (?m=&ok=): aviso flotante que se cierra (app/admin/aviso.tsx). */
export function Mensaje({ m, ok }: { m?: string; ok?: string }) {
  if (!m) return null;
  return <AvisoResultado key={`${m}|${ok}`} m={m} ok={ok === "1"} />;
}

/** Aviso fijo dentro de la página (no es el resultado de una acción). */
export function Nota({ tono = "info", children }: { tono?: "info" | "poco" | "mal"; children: React.ReactNode }) {
  return <p className={`ad-nota ${tono}`}>{children}</p>;
}

/** Barra de uso: verde, ámbar desde el 80 % y roja al tope. */
export function Barra({ gasto, tope, etiqueta }: { gasto: number; tope: number; etiqueta?: string }) {
  const pct = tope > 0 ? Math.min(100, (gasto / tope) * 100) : 100;
  return (
    <span
      className={`ad-barra${pct >= 100 ? " lleno" : pct >= 80 ? " cerca" : ""}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={etiqueta ?? "Uso del tope"}
      title={`${Math.round(pct)} % del tope`}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Píldora de estado: con punto de color y texto (el color nunca va solo). */
export function Pildora({ tono = "gris", punto = true, children }: { tono?: Tono; punto?: boolean; children: React.ReactNode }) {
  return (
    <span className={`ad-pildora ${tono}`}>
      {punto && <span className="ad-punto" aria-hidden />}
      {children}
    </span>
  );
}

/** Compatibilidad con los nombres viejos de tono. */
export function Insignia({ tono = "gris", children }: { tono?: "verde" | "ambar" | "rojo" | "gris"; children: React.ReactNode }) {
  const t: Tono = tono === "verde" ? "bien" : tono === "ambar" ? "poco" : tono === "rojo" ? "mal" : "gris";
  return <Pildora tono={t}>{children}</Pildora>;
}

/** Tarjeta de cifra del Resumen y de IA y topes. */
export function Kpi({
  icono,
  valor,
  etiqueta,
  detalle,
  tono,
  children,
}: {
  icono: React.ReactNode;
  valor: React.ReactNode;
  etiqueta: string;
  detalle?: React.ReactNode;
  tono?: Tono;
  children?: React.ReactNode;
}) {
  return (
    <div className={`ad-kpi${tono ? ` ${tono}` : ""}`}>
      <span className="ad-kpi-icono">{icono}</span>
      <span className="ad-kpi-etiqueta">{etiqueta}</span>
      <strong className="ad-kpi-valor">{valor}</strong>
      {detalle && <span className="ad-kpi-detalle">{detalle}</span>}
      {children}
    </div>
  );
}

/** Tarjeta de sección con título, ícono y explicación. */
export function Tarjeta({
  titulo,
  icono,
  descripcion,
  id,
  acciones,
  children,
  className,
}: {
  titulo: string;
  icono?: React.ReactNode;
  descripcion?: React.ReactNode;
  id?: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`ad-tarjeta${className ? ` ${className}` : ""}`} id={id} aria-labelledby={id ? `${id}-titulo` : undefined}>
      <header className="ad-tarjeta-cab">
        {icono && <span className="ad-tarjeta-icono">{icono}</span>}
        <div>
          <h2 id={id ? `${id}-titulo` : undefined}>{titulo}</h2>
          {descripcion && <p>{descripcion}</p>}
        </div>
        {acciones && <div className="ad-tarjeta-acciones">{acciones}</div>}
      </header>
      {children}
    </section>
  );
}

/** Cabecera de la página: migas (en las de un corredor), título, una línea y acciones a la derecha. */
export function Encabezado({
  titulo,
  descripcion,
  migas,
  acciones,
  antes,
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  migas?: { href: string; nombre: string }[];
  acciones?: React.ReactNode;
  /** Algo a la izquierda del título (el círculo del corredor). */
  antes?: React.ReactNode;
}) {
  return (
    <header className="ad-encabezado">
      {migas && migas.length > 0 && (
        <nav className="ad-migas" aria-label="Estás en">
          <ol>
            {migas.map((m) => (
              <li key={m.href}>
                <Link href={m.href}>{m.nombre}</Link>
              </li>
            ))}
            <li aria-current="page">{titulo}</li>
          </ol>
        </nav>
      )}
      <div className="ad-encabezado-fila">
        {antes}
        <div className="ad-encabezado-texto">
          <h1>{titulo}</h1>
          {descripcion && <p>{descripcion}</p>}
        </div>
        {acciones && <div className="ad-encabezado-acciones">{acciones}</div>}
      </div>
    </header>
  );
}

/** Estado vacío: ícono, una frase y, si hace falta, qué hacer. */
export function Vacio({ icono, titulo, children }: { icono?: React.ReactNode; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="ad-vacio">
      {icono && <span className="ad-vacio-icono">{icono}</span>}
      <strong>{titulo}</strong>
      {children && <span>{children}</span>}
    </div>
  );
}

/** Círculo con iniciales (corredor o usuario). */
export function Avatar({ nombre, tamano = 40, tono }: { nombre: string; tamano?: number; tono?: "verde" | "gris" }) {
  return (
    <span className={`ad-avatar${tono ? ` ${tono}` : ""}`} style={{ width: tamano, height: tamano, fontSize: Math.round(tamano * 0.38) }} aria-hidden>
      {iniciales(nombre)}
    </span>
  );
}

/** Energía del mes de un corredor (lo que él ve como batería): usada en %, con dólares usados de dólares del tope. */
export function EnergiaMes({ gastoMes, topeMes, compacta }: { gastoMes: number; topeMes: number; compacta?: boolean }) {
  const e = estadoEnergia({ gastoMesUsd: gastoMes, topeMesUsd: topeMes });
  return (
    <span className={`ad-energia${compacta ? " compacta" : ""}`}>
      <span className="ad-energia-texto">
        <span>
          Energía usada <strong>{e.usado} %</strong>
        </span>
        {e.nivel === "agotado" ? <em className="ad-txt-mal">agotada</em> : e.nivel === "poco" ? <em className="ad-txt-poco">queda poca</em> : null}
      </span>
      <Barra gasto={gastoMes} tope={topeMes} etiqueta="Energía usada del mes" />
      <span className="ad-suave ad-energia-usd">
        {usd(gastoMes)} de {usd(topeMes)}
      </span>
    </span>
  );
}

export const EXPLICA_ENERGIA = "El monto del mes es el 100 % de la energía de la asistente: el corredor ve una batería con lo que le queda. Se guarda en dólares.";
