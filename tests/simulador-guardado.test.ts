import { describe, expect, it } from "vitest";
import { NADA } from "@/lib/simulador/calificar";
import { acumularPlan, enlacesCerebro, leerPrueba, serializarPrueba, ultimoIdRespuesta, type Linea, type PruebaGuardada } from "@/lib/simulador/guardado";

const AHORA = new Date(2026, 10, 13, 15, 0).getTime();
const base = (n: number): PruebaGuardada => {
  const lineas: Linea[] = [];
  for (let i = 1; i <= n; i++) lineas.push({ tipo: "asistente", texto: `t${i}`, id: `r${i}`, pregunta: "p" });
  return {
    estado: { mensajes: [{ direccion: "entrante", autor: "cliente", contenido: "hola" }], citas: [], escalada: false },
    lineas,
    calificaciones: { r1: { valor: "mal", motivo: "falta", ensenadas: 1, plan: { ...NADA, duda: "p" }, frase: "x" }, [`r${n}`]: { valor: "bien" } },
    nota: 4,
  };
};

describe("estado guardado de Probar", () => {
  it("ida y vuelta", () => {
    const p = base(3);
    expect(leerPrueba(serializarPrueba(p, AHORA), AHORA + 1000)).toEqual(p);
  });
  it("forma inválida se descarta", () => {
    expect(leerPrueba("no es json", AHORA)).toBeNull();
    expect(leerPrueba(null, AHORA)).toBeNull();
    const ok = JSON.parse(serializarPrueba(base(2), AHORA));
    expect(leerPrueba(JSON.stringify({ ...ok, v: 2 }), AHORA)).toBeNull();
    expect(leerPrueba(JSON.stringify({ ...ok, nota: 9 }), AHORA)).toBeNull();
    expect(leerPrueba(JSON.stringify({ ...ok, lineas: [{ tipo: "otro", texto: "x" }] }), AHORA)).toBeNull();
    expect(leerPrueba(JSON.stringify({ ...ok, estado: { mensajes: "x", citas: [], escalada: false } }), AHORA)).toBeNull();
    expect(leerPrueba(JSON.stringify({ ...ok, calificaciones: { r1: { valor: "regular" } } }), AHORA)).toBeNull();
  });
  it("más de 24 h u otro día se descarta", () => {
    const t = serializarPrueba(base(2), AHORA);
    expect(leerPrueba(t, AHORA + 25 * 3600_000)).toBeNull();
    expect(leerPrueba(t, new Date(2026, 10, 14, 8, 0).getTime())).toBeNull();
    expect(leerPrueba(t, new Date(2026, 10, 13, 23, 0).getTime())).not.toBeNull();
  });
  it("recorta a 60 líneas y quita calificaciones de las que salieron", () => {
    const r = leerPrueba(serializarPrueba(base(80), AHORA), AHORA)!;
    expect(r.lineas).toHaveLength(60);
    expect(r.lineas[0]).toMatchObject({ id: "r21" });
    expect(Object.keys(r.calificaciones)).toEqual(["r80"]);
    expect(ultimoIdRespuesta(r.lineas)).toBe(80);
  });
});

describe("resumen acumulado", () => {
  it("cambiar de 'le faltó' a 'pásamelo' conserva la duda y su enlace", () => {
    const duda = { ...NADA, duda: "¿tiene piscina?" };
    const plan = acumularPlan(duda, { ...NADA, irAAjustes: true });
    expect(plan.duda).toBe("¿tiene piscina?");
    expect(plan.irAAjustes).toBe(true);
    expect(enlacesCerebro([plan]).map((e) => e.texto)).toEqual(["Ver sus preguntas"]);
  });
  it("acumula los tres tipos y no repite enlaces", () => {
    const a = acumularPlan(undefined, { ...NADA, correccion: { original: "a", corregido: "b" } });
    const b = acumularPlan(a, { ...NADA, conocimiento: { tema: "t", respuesta: "r" } });
    const c = acumularPlan(b, { ...NADA, duda: "d" });
    expect(enlacesCerebro([c, a]).map((e) => e.texto)).toEqual(["Ver correcciones", "Ver lo que sabe", "Ver sus preguntas"]);
    expect(enlacesCerebro([])).toEqual([]);
  });
});
