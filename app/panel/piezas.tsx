import Link from "next/link";
import { Volver } from "./volver";

// Piezas de presentación que se repiten en el panel: el encabezado de cada pantalla, las cifras de arriba y
// lo que se ve cuando una lista está vacía. Solo forma: los datos y los textos los pone cada página.

type IconoProps = { tamano?: number };
type Icono = (p: IconoProps) => React.ReactNode;

/**
 * Título de la pantalla, una línea de apoyo y las acciones a la derecha (en el teléfono, debajo). Con `atras`, arriba
 * va "‹ Pantalla" (el mismo `Volver` de las demás, así el título queda a la misma altura); `soloTelefono` lo esconde en
 * computadora, donde esa pantalla ya está en el menú de la izquierda.
 */
export function EncabezadoPagina({
  titulo,
  apoyo,
  children,
  className,
  atras,
}: {
  titulo: React.ReactNode;
  apoyo?: React.ReactNode;
  /** Botones o enlaces de la pantalla. */
  children?: React.ReactNode;
  className?: string;
  atras?: { href: string; texto: string; soloTelefono?: boolean };
}) {
  return (
    <>
      {atras && <Volver href={atras.href} texto={atras.texto} className={atras.soloTelefono ? "solo-telefono" : undefined} />}
      <header className={`encabezado encabezado-pagina${className ? ` ${className}` : ""}`}>
        <div className="encabezado-texto">
          <h1>{titulo}</h1>
          {apoyo && <p className="suave">{apoyo}</p>}
        </div>
        {children && <div className="encabezado-acciones">{children}</div>}
      </header>
    </>
  );
}

export type Tono = "verde" | "azul" | "morado" | "ambar" | "rojo";

/** Una cifra de arriba: ícono chico con el color de su tipo, número grande y qué es. */
export function Cifra({
  numero,
  children,
  Icono,
  tono = "verde",
  href,
  alerta,
  dataPatty,
}: {
  numero: React.ReactNode;
  /** Qué es la cifra, en palabras de todos los días. */
  children: React.ReactNode;
  Icono: Icono;
  tono?: Tono;
  href?: string;
  alerta?: boolean;
  dataPatty?: string;
}) {
  const clase = `tarjeta cifra${alerta ? " alerta" : ""}`;
  const cuerpo = (
    <>
      <span className="cifra-icono" aria-hidden>
        <Icono tamano={18} />
      </span>
      <strong>{numero}</strong>
      <span className="suave">{children}</span>
    </>
  );
  return href ? (
    <Link href={href} className={clase} data-tono={alerta ? "rojo" : tono} data-patty={dataPatty}>
      {cuerpo}
    </Link>
  ) : (
    <div className={clase} data-tono={alerta ? "rojo" : tono} data-patty={dataPatty}>
      {cuerpo}
    </div>
  );
}

/** Lista vacía: ícono grande y suave, qué pasa y, si la hay, la acción que sigue. */
export function Vacio({
  Icono,
  titulo,
  children,
  accion,
  compacto,
  className,
}: {
  Icono: Icono;
  titulo?: React.ReactNode;
  /** Una frase que explica qué va a aparecer aquí y cómo. */
  children?: React.ReactNode;
  /** El botón o enlace de lo que sigue. */
  accion?: React.ReactNode;
  /** Más bajo, para dentro de una tarjeta o una columna. */
  compacto?: boolean;
  className?: string;
}) {
  return (
    <div className={`vacio-bloque${compacto ? " compacto" : ""}${className ? ` ${className}` : ""}`}>
      <span className="vacio-icono" aria-hidden>
        <Icono tamano={compacto ? 26 : 34} />
      </span>
      {titulo && <p className="vacio-titulo">{titulo}</p>}
      {children && <p className="vacio-texto">{children}</p>}
      {accion && <div className="vacio-accion">{accion}</div>}
    </div>
  );
}
