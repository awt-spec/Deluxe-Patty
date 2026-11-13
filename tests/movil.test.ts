import { describe, expect, it } from "vitest";
import {
  cambioBarra,
  columnaInicialSemana,
  desplazamientoParaVer,
  diaInicialMes,
  puntosDelDia,
  resumenBusca,
  resumenCampos,
  resumenListo,
} from "@/lib/panel/movil";

const SEMANA = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];

describe("semana en el teléfono", () => {
  it("abre con hoy como primera columna", () => {
    expect(columnaInicialSemana(SEMANA, "2026-11-13")).toBe(4);
    expect(columnaInicialSemana(SEMANA, "2026-11-09")).toBe(0);
  });
  it("si hoy no está en la semana, empieza en lunes", () => {
    expect(columnaInicialSemana(SEMANA, "2026-11-20")).toBe(0);
  });
});

describe("mes en el teléfono", () => {
  it("hasta tres puntos y +N", () => {
    expect(puntosDelDia(0)).toEqual({ puntos: 0, mas: 0 });
    expect(puntosDelDia(2)).toEqual({ puntos: 2, mas: 0 });
    expect(puntosDelDia(5)).toEqual({ puntos: 3, mas: 2 });
  });
  it("elige hoy en el mes de hoy", () => {
    expect(diaInicialMes("2026-11", "2026-11-13", ["2026-11-16"])).toBe("2026-11-13");
  });
  it("en otro mes, el primer día con visitas o el 1", () => {
    expect(diaInicialMes("2026-12", "2026-11-13", ["2026-12-09", "2026-12-03", "2026-11-30"])).toBe("2026-12-03");
    expect(diaInicialMes("2026-12", "2026-11-13", [])).toBe("2026-12-01");
  });
  it("respeta el día pedido si es de ese mes", () => {
    expect(diaInicialMes("2026-11", "2026-11-13", [], "2026-11-20")).toBe("2026-11-20");
    expect(diaInicialMes("2026-11", "2026-11-13", [], "2026-12-20")).toBe("2026-11-13");
    expect(diaInicialMes("2026-11", "2026-11-13", [], "mañana")).toBe("2026-11-13");
  });
});

describe("barra que se esconde", () => {
  it("se oculta al bajar y vuelve al subir", () => {
    expect(cambioBarra(300, 340)).toBe("ocultar");
    expect(cambioBarra(340, 300)).toBe("mostrar");
  });
  it("no parpadea con movimientos chicos y cerca de arriba siempre se ve", () => {
    expect(cambioBarra(300, 304)).toBeNull();
    expect(cambioBarra(20, 60)).toBe("mostrar");
  });
});

describe("resúmenes de lo plegado", () => {
  it("junta lo llenado y lo corta", () => {
    expect(resumenCampos(["DP-01", "", "  Casa  en   Escazú ", null])).toBe("DP-01 · Casa en Escazú");
    expect(resumenCampos([], 64, "Sin llenar")).toBe("Sin llenar");
    const largo = resumenCampos(["a".repeat(80)], 20);
    expect(largo).toHaveLength(20);
    expect(largo.endsWith("…")).toBe(true);
  });
  it("arma la línea de Qué busca", () => {
    expect(
      resumenBusca([
        { k: "Para", v: "Comprar" },
        { k: "Zonas", v: "Escazú" },
        { k: "Hasta", v: "$1.100.000" },
      ]),
    ).toBe("Qué busca: comprar · Escazú · hasta $1.100.000");
    expect(resumenBusca([{ k: "Cuartos", v: "1" }])).toBe("Qué busca: 1 cuarto");
    expect(resumenBusca([])).toBe("Qué busca: todavía no lo dijo");
  });
  it("dice qué se hizo después de un cambio", () => {
    expect(resumenListo("Hecho.", ["Puse la piscina de primera"])).toBe("Listo: puse la piscina de primera");
    expect(resumenListo("Lo hice más corto")).toBe("Listo: lo hice más corto");
  });
});

describe("vista previa encima de la hoja", () => {
  it("no mueve si ya se ve", () => {
    expect(desplazamientoParaVer({ top: 100, alto: 200 }, 60, 400)).toBe(0);
  });
  it("centra en el espacio libre si cabe", () => {
    // Espacio de 60 a 400 (340 px), elemento de 200 px abajo de la hoja: su tope queda en 60 + 70.
    expect(desplazamientoParaVer({ top: 600, alto: 200 }, 60, 400)).toBe(470);
    expect(desplazamientoParaVer({ top: -300, alto: 200 }, 60, 400)).toBe(-430);
  });
  it("si no cabe, deja su borde de arriba bajo lo pegajoso", () => {
    expect(desplazamientoParaVer({ top: 500, alto: 600 }, 60, 400)).toBe(440);
  });
});
