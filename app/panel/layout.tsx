import type { CSSProperties } from "react";
import { sesionCorredor } from "@/lib/panel/sesion";
import { Navegacion } from "./navegacion";

export const dynamic = "force-dynamic";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const { corredor } = await sesionCorredor();
  if (!corredor) {
    return (
      <main className="entrar">
        <h1>Sin acceso</h1>
        <p className="suave">Tu cuenta todavía no está enlazada a un corredor. Escríbele a soporte.</p>
      </main>
    );
  }
  // El panel toma los colores de la marca del corredor.
  const c = corredor.marca?.colores;
  const estilo = c
    ? ({ "--principal": c.principal, "--soporte": c.soporte, "--profundo": c.profundo, "--base": c.base } as CSSProperties)
    : undefined;
  return (
    <div style={estilo} className="marco">
      <main className="panel">{children}</main>
      <Navegacion />
    </div>
  );
}
