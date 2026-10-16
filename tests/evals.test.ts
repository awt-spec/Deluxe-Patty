import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PropiedadConFotos } from "../lib/datos/tipos";
import { aNumero, calificar, cifras, expresion, type Caso, type Turno } from "../evals/conversaciones/calificar";

const leer = <T>(archivo: string): T => JSON.parse(readFileSync(new URL(`../evals/conversaciones/${archivo}`, import.meta.url), "utf8"));
const propiedades = leer<PropiedadConFotos[]>("propiedades.json");
const { casos } = leer<{ casos: Caso[] }>("casos.json");

function turno(t: Partial<Turno>): Turno {
  return {
    cliente: "",
    resultado: { tipo: "respondido" },
    intencion: "consulta_propiedad",
    respuestas: [],
    avisos: [],
    errores: [],
    ...t,
  };
}

const fallidas = (r: ReturnType<typeof calificar>) => r.filter((x) => !x.ok).map((x) => x.regla);

describe("set de conversaciones", () => {
  it("los casos están bien formados", () => {
    const ids = new Set<string>();
    for (const c of casos) {
      expect(ids.has(c.id), c.id).toBe(false);
      ids.add(c.id);
      expect(c.turnos.length).toBeGreaterThan(0);
      for (const p of [...(c.esperado.debe ?? []), ...(c.esperado.no_debe ?? [])]) expect(() => expresion(p)).not.toThrow();
      if (c.esperado.intencion) {
        expect(["consulta_propiedad", "agendar_visita", "otro", "pasar_a_corredor"]).toContain(c.esperado.intencion);
      }
    }
    expect(casos.length).toBeGreaterThanOrEqual(30);
  });

  it("lee cifras como las escribe la asistente", () => {
    expect(aNumero("450.000")).toBe(450000);
    expect(aNumero("$2,200")).toBe(2200);
    expect(aNumero("450 mil")).toBe(450000);
    expect(aNumero("3,5")).toBe(3.5);
    expect(cifras("El martes 20 de octubre, 3:00 p. m. Cuesta USD 450.000 y tiene 320 m².")).toEqual([450000, 320]);
  });

  const consulta = casos.find((c) => c.id === "consulta-precio")!;

  it("pasa una respuesta con datos de la propiedad", () => {
    const r = calificar(consulta, [turno({ respuestas: ["El apartamento se alquila en USD 2.200 al mes, amueblado."] })], propiedades);
    expect(fallidas(r)).toEqual([]);
  });

  it("señala cifras inventadas, fechas del modelo y avisos de más", () => {
    const r = calificar(
      consulta,
      [
        turno({
          respuestas: ["Son USD 2.200 y la cuota es de 150 dólares. Puede verlo el lunes 19 de octubre."],
          avisos: ["aviso"],
        }),
      ],
      propiedades,
    );
    expect(fallidas(r)).toEqual(["aviso_corredora", "sin_cifras_inventadas", "sin_fechas_del_modelo"]);
    expect(r.find((x) => x.regla === "sin_cifras_inventadas")!.detalle).toBe("150");
  });

  it("revisa el último turno de una conversación de agenda", () => {
    const caso = casos.find((c) => c.id === "agenda-elige-opcion")!;
    const turnos = [
      turno({ intencion: "agendar_visita", resultado: { tipo: "agenda", accion: "propuesto" }, respuestas: ["Tengo martes 20 de octubre, 9:00 a. m."] }),
      turno({ intencion: "agendar_visita", resultado: { tipo: "agenda", accion: "propuesto" }, respuestas: ["¿Cuál prefiere?"] }),
    ];
    expect(fallidas(calificar(caso, turnos, propiedades))).toEqual(["accion_agenda", "aviso_corredora"]);
    expect(fallidas(calificar(caso, turnos.slice(0, 1), propiedades))).toEqual(["completo"]);
  });

  it("aplica debe y no_debe sin distinguir mayúsculas con (?i)", () => {
    const caso = casos.find((c) => c.id === "ingles-consulta")!;
    const bien = calificar(caso, [turno({ respuestas: ["Yes, it is available. The price is USD 450,000."] })], propiedades);
    expect(fallidas(bien)).toEqual([]);
    const mal = calificar(caso, [turno({ respuestas: ["Hola, sí está disponible."] })], propiedades);
    expect(fallidas(mal)).toEqual(["debe", "no_debe"]);
  });
});
