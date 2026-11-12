import { describe, expect, it } from "vitest";
import { bloques, esRutaDelPanel, separarPedido, trozos } from "@/lib/panel/markdown";

describe("Lo que escribe Patty, en bloques", () => {
  it("separa títulos, párrafos, listas, tablas, citas y diagramas", () => {
    const b = bloques(
      [
        "Tienes **2 visitas** hoy.",
        "",
        "## A quién llamar",
        "- Laura",
        "- Robert",
        "",
        "1. Primero esto",
        "2. Después aquello",
        "",
        "| Casa | Precio |",
        "|---|---:|",
        "| Escazú | $1.250.000 |",
        "",
        "> Hola, le escribo de Deluxe.",
        "",
        "```mermaid",
        "flowchart TD",
        "  A --> B",
        "```",
        "---",
      ].join("\n"),
    );
    expect(b.map((x) => x.tipo)).toEqual(["parrafo", "titulo", "lista", "lista", "tabla", "cita", "codigo"]);
    expect(b[1]).toEqual({ tipo: "titulo", nivel: 2, texto: "A quién llamar" });
    expect(b[3]).toMatchObject({ ordenada: true, items: ["Primero esto", "Después aquello"] });
    expect(b[4]).toEqual({ tipo: "tabla", cabecera: ["Casa", "Precio"], filas: [["Escazú", "$1.250.000"]] });
    expect(b[6]).toMatchObject({ tipo: "codigo", lenguaje: "mermaid", texto: "flowchart TD\n  A --> B" });
  });

  it("un bloque de código sin cerrar llega hasta el final y una fila corta se completa", () => {
    expect(bloques("```mermaid\npie\n \"A\" : 1")).toEqual([{ tipo: "codigo", lenguaje: "mermaid", texto: 'pie\n "A" : 1' }]);
    expect(bloques("| a | b |\n|--|--|\n| 1 |")[0]).toMatchObject({ filas: [["1", ""]] });
  });

  it("el HTML queda como texto y solo las rutas del panel son enlaces", () => {
    expect(trozos("<script>alert(1)</script> **ojo**")).toEqual([
      { tipo: "texto", texto: "<script>alert(1)</script> " },
      { tipo: "negrita", texto: "ojo" },
    ]);
    expect(esRutaDelPanel("/panel/agenda")).toBe(true);
    expect(esRutaDelPanel("https://malo.example")).toBe(false);
    expect(esRutaDelPanel("javascript:alert(1)")).toBe(false);
  });

  it("el pedido de PDF o de imagen sale del texto con su título", () => {
    expect(separarPedido("# Informe\n\nTexto\n<<pdf Informe de noviembre>>")).toEqual({ texto: "# Informe\n\nTexto", pdf: "Informe de noviembre", png: null });
    expect(separarPedido("Resumen\n<<png Clientes de hoy>>")).toEqual({ texto: "Resumen", pdf: null, png: "Clientes de hoy" });
    expect(separarPedido("Sin pedido")).toEqual({ texto: "Sin pedido", pdf: null, png: null });
  });
});
