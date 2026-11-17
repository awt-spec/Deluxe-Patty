import { describe, expect, it } from "vitest";
import { armarAviso, citaCorta, ordenarParaWhatsApp as f } from "../lib/whatsapp/formato";
import { limpiarParametro } from "../lib/whatsapp/enviar";

describe("ordenarParaWhatsApp: markdown → WhatsApp", () => {
  it("negritas de markdown pasan a *x*", () => {
    expect(f("El **precio** es __fijo__.")).toBe("El *precio* es *fijo*.");
    expect(f("***Muy*** importante")).toBe("*Muy* importante");
    expect(f("** con espacios **")).toBe("*con espacios*");
  });

  it("deja la negrita y la cursiva de WhatsApp como están", () => {
    expect(f("*Precio:* $250.000 y _cursiva_")).toBe("*Precio:* $250.000 y _cursiva_");
  });

  it("tachado ~~x~~ → ~x~", () => {
    expect(f("~~$300.000~~ $280.000")).toBe("~$300.000~ $280.000");
  });

  it("encabezados → línea en negrita (sin asteriscos dobles)", () => {
    expect(f("# Resumen")).toBe("*Resumen*");
    expect(f("### **Casa en Escazú** ###")).toBe("*Casa en Escazú*");
    expect(f("#1 en ventas")).toBe("#1 en ventas");
  });

  it("viñetas - * + → •, y las anidadas → ◦", () => {
    expect(f("- uno\n* dos\n+ tres")).toBe("• uno\n• dos\n• tres");
    expect(f("- padre\n  - hijo")).toBe("• padre\n  ◦ hijo");
    expect(f("- **Precio:** $485.000")).toBe("• *Precio:* $485.000");
  });

  it("no confunde una negrita al inicio de línea con una viñeta", () => {
    expect(f("*Precio:* $250.000")).toBe("*Precio:* $250.000");
  });

  it("mantiene las listas numeradas", () => {
    expect(f("1. Martes 3 de marzo, 10:00 a. m.\n2. Jueves 5 de marzo, 2:00 p. m.")).toBe(
      "1. Martes 3 de marzo, 10:00 a. m.\n2. Jueves 5 de marzo, 2:00 p. m.",
    );
    expect(f("1) **Uno**\n2) Dos")).toBe("1) *Uno*\n2) Dos");
  });

  it("no toma una cifra al inicio como lista", () => {
    expect(f("1.5 millones de colones")).toBe("1.5 millones de colones");
    expect(f("250.000 dólares")).toBe("250.000 dólares");
  });

  it("quita viñetas y números huérfanos", () => {
    expect(f("• uno\n- \n-\n•\n* \n+\n3.\n• dos")).toBe("• uno\n• dos");
  });

  it("tabla de dos columnas → • dato: valor", () => {
    const t = "| Dato | Valor |\n|---|---|\n| Precio | $250.000 |\n| Cuartos | 3 |";
    expect(f(t)).toBe("• Precio: $250.000\n• Cuartos: 3");
  });

  it("tabla de varias columnas → título en negrita y • columna: valor", () => {
    const t = "Comparables:\n| Casa | Precio | m² |\n|:---|---:|:-:|\n| **DP-01** | $250.000 | 180 |\n| DP-02 | ₡95.000.000 | |";
    expect(f(t)).toBe("Comparables:\n\n*DP-01*\n• Precio: $250.000\n• m²: 180\n\n*DP-02*\n• Precio: ₡95.000.000");
  });

  it("una línea con | sin fila separadora no es tabla", () => {
    expect(f("Escazú | Santa Ana")).toBe("Escazú | Santa Ana");
    expect(f("Escazú | Santa Ana\n---\nOtra")).toBe("Escazú | Santa Ana\n\nOtra");
  });

  it("quita las cercas de código y las comillas invertidas", () => {
    expect(f("Mira:\n```json\n{\"a\": 1}\n```\nListo `DP-01`")).toBe('Mira:\n{"a": 1}\nListo DP-01');
  });

  it("enlaces de markdown → texto y URL, sin tocar la URL", () => {
    const url = "https://www.encuentra24.com/costa-rica-es/casa_escazu/31234567?a=1&b=__x__";
    expect(f(`[Ver anuncio](${url})`)).toBe(`Ver anuncio: ${url}`);
    expect(f(`Véala aquí: [Encuentra24](${url})`)).toBe(`Véala aquí: Encuentra24 ${url}`);
    expect(f(`[${url}](${url})`)).toBe(url);
    expect(f(`<${url}>`)).toBe(url);
    expect(f(`![foto](https://x.supabase.co/fotos/a_b.jpg)`)).toBe("foto: https://x.supabase.co/fotos/a_b.jpg");
  });

  it("nunca altera una URL con guiones bajos, asteriscos o almohadillas", () => {
    for (const url of [
      "https://wa.me/50688887777?text=Hola%20me%20interesa%20DP-01_x",
      "https://ejemplo.com/a__b__c",
      "https://ejemplo.com/**raro**",
      "https://ejemplo.com/#seccion",
      "https://ejemplo.com/~~x~~",
    ]) {
      expect(f(`Mire: ${url}`)).toBe(`Mire: ${url}`);
      expect(f(`- ${url}`)).toBe(`• ${url}`);
    }
  });

  it("no cambia cifras, precios ni fechas", () => {
    const t = "• *Precio:* $1.250.000 (₡650.000.000)\n• 4,5 % de comisión\n• Martes 3 de marzo, 10:00 a. m.\n• 2026-11-17 · -5 %";
    expect(f(t)).toBe(t);
    expect(f("3 * 4 = 12 y 5*6")).toBe("3 * 4 = 12 y 5*6");
  });

  it("espacios: tres o más saltos → dos, sin espacios al final, sin bordes", () => {
    expect(f("  Hola   \n\n\n\n¿Le sirve?  \t\n\n")).toBe("Hola\n\n¿Le sirve?");
    expect(f("a\r\nb\rc")).toBe("a\nb\nc");
    expect(f("a<br>b<br/>c")).toBe("a\nb\nc");
  });

  it("quita las reglas horizontales", () => {
    expect(f("Uno\n---\nDos\n***\nTres")).toBe("Uno\n\nDos\n\nTres");
  });

  it("texto vacío", () => {
    expect(f("")).toBe("");
    expect(f("   \n\n ")).toBe("");
  });

  it("un texto de WhatsApp que ya está bien no cambia", () => {
    const t = "Hola Ana, la casa de Escazú sigue disponible:\n\n• *Precio:* $485.000\n• *Cuartos:* 3\n\n¿Le gustaría verla esta semana?";
    expect(f(t)).toBe(t);
  });

  it("es idempotente", () => {
    const muestras = [
      "## **Resumen**\n\n- **Precio:** $485.000\n  * sub\n|a|b|c|\n|-|--|--|\n|x|1|2|\n\n\n\n[l](https://a.com/x_y)",
      "```\ncódigo\n```\n1) uno\n- \n~~x~~ __y__ ***z***",
      "Sin formato alguno, con $250.000 y 3 cuartos.",
      "*Ya* • en _WhatsApp_\n  ◦ anidado",
    ];
    for (const m of muestras) {
      const una = f(m);
      expect(f(una)).toBe(una);
    }
  });
});

describe("armarAviso", () => {
  it("primera línea en negrita y una línea por dato, teléfono aparte", () => {
    expect(
      armarAviso({
        titulo: "No le llegó un mensaje a Robert Miller.",
        porQue: "pasaron más de 24 horas desde su último mensaje",
        mensaje: "Sí, la casa\nsigue disponible.",
        queHacer: "escríbele desde tu WhatsApp",
        telefono: "+50688887777",
      }),
    ).toBe(
      '*No le llegó un mensaje a Robert Miller*\nPor qué: Pasaron más de 24 horas desde su último mensaje.\nMensaje: "Sí, la casa sigue disponible."\nQué hacer: Escríbele desde tu WhatsApp.\nTeléfono: +50688887777',
    );
  });

  it("omite lo que no viene y pone los detalles antes de Qué hacer", () => {
    expect(armarAviso({ titulo: "Nueva visita: Ana", detalles: ["Cuándo: martes 3 de marzo, 10:00 a. m.", null, false], telefono: "+506" })).toBe(
      "*Nueva visita: Ana*\nCuándo: martes 3 de marzo, 10:00 a. m.\nTeléfono: +506",
    );
  });

  it("corta el mensaje citado", () => {
    expect(citaCorta("a".repeat(300)).length).toBe(200);
    expect(citaCorta("  hola \n\n mundo ")).toBe("hola mundo");
  });

  it("para la plantilla se aplana en una línea sin saltos, tabuladores ni 4 espacios", () => {
    const aviso = armarAviso({
      titulo: "No le llegó un mensaje a Ana",
      porQue: "WhatsApp no lo entregó",
      mensaje: "Hola\t\tcon    espacios",
      queHacer: "escríbele",
      telefono: "+50688880001",
    });
    const p = limpiarParametro(aviso);
    expect(p).not.toMatch(/[\n\r\t]/);
    expect(p).not.toMatch(/ {4,}/);
    expect(p).toBe('*No le llegó un mensaje a Ana* · Por qué: WhatsApp no lo entregó. · Mensaje: "Hola con espacios" · Qué hacer: Escríbele. · Teléfono: +50688880001');
  });

  it("limpiarParametro: viñetas y líneas vacías no dejan separadores sueltos", () => {
    expect(limpiarParametro("*Título*\n\n• uno\n• dos\n")).toBe("*Título* · uno · dos");
  });
});
