import { describe, expect, it } from "vitest";
import {
  correccionesRecientes,
  diasDelHorario,
  faltaPreparacion,
  listaPreparacion,
  pendientesCerebro,
  resumenHorario,
  seccionesCerebro,
  vistaCerebro,
} from "@/app/panel/cerebro/resumen";
import { NOMBRE_CEREBRO, apoyoCerebro } from "@/app/panel/cerebro/nombre";

describe("vistaCerebro", () => {
  it("las direcciones nuevas llevan a su sección", () => {
    expect(vistaCerebro("necesita", 0)).toEqual({ ver: "necesita", portada: false });
    expect(vistaCerebro("sabe", 3)).toEqual({ ver: "sabe", portada: false });
    expect(vistaCerebro("contesta", 3)).toEqual({ ver: "contesta", portada: false });
    expect(vistaCerebro("mapa", 0)).toEqual({ ver: "mapa", portada: false });
  });

  it("las viejas siguen llevando al lugar equivalente", () => {
    expect(vistaCerebro("dudas", 0).ver).toBe("necesita");
    expect(vistaCerebro("fuentes", 0).ver).toBe("sabe");
    expect(vistaCerebro("errores", 0)).toEqual({ ver: "contesta", ancla: "correcciones", portada: false });
  });

  it("sin ver (o con inicio u otra cosa) la portada es lo pendiente si hay, y si no lo que sabe", () => {
    expect(vistaCerebro(undefined, 2)).toEqual({ ver: "necesita", portada: true });
    expect(vistaCerebro(undefined, 0)).toEqual({ ver: "sabe", portada: true });
    expect(vistaCerebro("inicio", 1).ver).toBe("necesita");
    expect(vistaCerebro("cualquiera", 0).ver).toBe("sabe");
    expect(vistaCerebro("__proto__", 0).ver).toBe("sabe");
  });
});

describe("lo pendiente y las tres secciones", () => {
  const base = { casas: [{ precio: 100, fotos: 3 }], franjas: 5, tono: "Cercana", temasCorredor: 3, sabe: 5, preguntas: 0 };

  it("lo que falta de la preparación no repite las preguntas", () => {
    const lista = listaPreparacion({ ...base, sabe: 2, preguntas: 3 });
    expect(faltaPreparacion(lista).map((r) => r.clave)).toEqual(["ensenado"]);
    expect(pendientesCerebro({ preguntas: 2, porUbicar: 1, falta: 1 })).toBe(4);
  });

  it("cuenta y resume cada sección", () => {
    const [necesita, sabe, contesta] = seccionesCerebro({
      preguntas: 2,
      porUbicar: 1,
      falta: 2,
      ensenado: 12,
      ubicadas: 1,
      casas: 3,
      correcciones: 5,
      automatica: false,
    });
    expect(necesita).toMatchObject({ clave: "necesita", numero: 5, urgente: true, linea: "2 preguntas · 1 casa sin zona · 2 cosas por preparar" });
    expect(sabe).toMatchObject({ clave: "sabe", numero: 13, urgente: false, linea: "3 casas · 12 cosas enseñadas" });
    expect(contesta).toMatchObject({ clave: "contesta", numero: 5, linea: "Espera tu visto bueno · 5 correcciones" });
  });

  it("sin nada pendiente dice que está al día, con singulares bien escritos", () => {
    const [necesita, sabe, contesta] = seccionesCerebro({
      preguntas: 0,
      porUbicar: 0,
      falta: 0,
      ensenado: 1,
      ubicadas: 0,
      casas: 1,
      correcciones: 1,
      automatica: true,
    });
    expect(necesita).toMatchObject({ numero: 0, urgente: false, linea: "Todo al día" });
    expect(sabe.linea).toBe("1 casa · 1 cosa enseñada");
    expect(contesta.linea).toBe("Contesta sola · 1 corrección");
  });
});

describe("correccionesRecientes", () => {
  it("cuenta solo las de los últimos días y salta fechas raras", () => {
    const ahora = new Date("2026-11-13T12:00:00Z");
    expect(correccionesRecientes(["2026-11-12T10:00:00Z", "2026-11-07T00:00:00Z", "2026-10-01T00:00:00Z", "nada"], ahora)).toBe(2);
    expect(correccionesRecientes([], ahora)).toBe(0);
  });
});

describe("resumenHorario", () => {
  const f = (dia_semana: number, hora_inicio: string, hora_fin: string) => ({ dia_semana, hora_inicio, hora_fin });

  it("una línea por día, lunes primero, en orden de hora y sin segundos", () => {
    const dias = resumenHorario([f(0, "09:00:00", "12:00:00"), f(1, "13:00:00", "17:00:00"), f(1, "08:00:00", "12:00:00")]);
    expect(dias).toEqual([
      { dia: "Lunes", texto: "8:00–12:00 y 13:00–17:00" },
      { dia: "Domingo", texto: "9:00–12:00" },
    ]);
  });

  it("la línea plegada dice los días en palabras", () => {
    const semana = resumenHorario([1, 2, 3, 4, 5].map((d) => f(d, "08:00", "12:00")));
    expect(diasDelHorario(semana)).toBe("Lunes a viernes");
    expect(diasDelHorario(resumenHorario([f(1, "08:00", "12:00"), f(3, "08:00", "12:00"), f(6, "08:00", "12:00")]))).toBe("Lunes, miércoles y sábado");
    expect(diasDelHorario(resumenHorario([f(2, "08:00", "12:00")]))).toBe("Martes");
    expect(diasDelHorario([])).toBe("Sin horario: no puede ofrecer citas");
  });
});

describe("nombre", () => {
  it("el nombre está en un solo lugar y el apoyo lleva el de la asistente", () => {
    expect(NOMBRE_CEREBRO).toBe("Cerebro de IA");
    expect(apoyoCerebro("Patty")).toBe("Lo que sabe Patty, cómo contesta y lo que necesita de ti");
  });
});
