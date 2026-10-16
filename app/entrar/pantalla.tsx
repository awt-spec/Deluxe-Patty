import type { CSSProperties } from "react";
import type { MarcaEntrada } from "@/lib/panel/marca";

/**
 * Marco de las pantallas de entrada (entrar, revisar el correo, sin acceso): fondo profundo con el logo
 * del corredor arriba y una tarjeta clara con el contenido. Sin marca se ve neutro.
 */
export function PantallaEntrada({ marca, children }: { marca: MarcaEntrada | null; children: React.ReactNode }) {
  const c = marca?.colores;
  const estilo = c
    ? ({
        "--principal": c.principal,
        "--soporte": c.soporte,
        "--profundo": c.profundo,
        "--base": c.base,
        background: marca?.fondoLogo ?? c.profundo,
      } as CSSProperties)
    : undefined;
  return (
    <div className="entrada" style={estilo}>
      <header className="entrada-marca">
        {marca?.logo ? (
          // El logo oficial va tal cual (no se recorta ni se recrea); su fondo es el profundo de la marca.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={marca.logo} alt={marca.nombre} width={176} height={176} />
        ) : (
          <p className="entrada-nombre">{marca?.nombre ?? "Tu asistente"}</p>
        )}
      </header>
      <main className="entrada-tarjeta">{children}</main>
      {marca?.eslogan && <p className="entrada-eslogan">{marca.eslogan}</p>}
    </div>
  );
}
