import { describe, expect, it } from "vitest";

// extension/ritmo.js es un módulo de la extensión (JavaScript sin compilar): se carga tal cual.
interface Tramo {
  hasta: number;
  ms: number;
}
interface Ritmo {
  RITMO: Record<string, number>;
  azar(semilla: number): () => number;
  entre(rng: () => number, min: number, max: number): number;
  lecturaEsperada(anuncios: number): number;
  planLectura(anuncios: number, rng: () => number): { ms: number; tramos: Tramo[] };
  ritmoInicial(rng: () => number): { paraDescanso: number };
  siguientePausa(e: { paraDescanso: number }, rng: () => number): { tipo: "pausa" | "descanso"; ms: number; estado: { paraDescanso: number } };
  hoyLocal(fecha?: Date): string;
  quedanHoy(registro: unknown, hoy: string): number;
  anotarPaginaDelDia(registro: unknown, hoy: string): { fecha: string; paginas: number };
  totalEstimado(zonas: number, restantesHoy: number, porZona?: number): number;
  estimarRestanteMs(paginas: number, espera?: number): number;
  textoRestante(ms: number): string;
  textoDuracion(paginas: number): string;
}
const RUTA = "../extension/ritmo.js";
const r = (await import(/* @vite-ignore */ RUTA)) as Ritmo;
const { RITMO } = r;

describe("ritmo de persona (extension/ritmo.js)", () => {
  it("las constantes son las acordadas", () => {
    expect(RITMO).toMatchObject({
      lecturaMinMs: 8_000,
      lecturaMaxMs: 25_000,
      pausaEntreMinMs: 6_000,
      pausaEntreMaxMs: 20_000,
      descansoCadaMin: 4,
      descansoCadaMax: 6,
      descansoMinMs: 45_000,
      descansoMaxMs: 120_000,
      maxPaginasSesion: 12,
      maxPaginasDia: 24,
    });
    expect(Object.isFrozen(RITMO)).toBe(true);
  });

  it("con la misma semilla, el mismo plan; con otra, otro", () => {
    const a = r.planLectura(20, r.azar(42));
    expect(r.planLectura(20, r.azar(42))).toEqual(a);
    expect(r.planLectura(20, r.azar(43))).not.toEqual(a);
  });

  it("la lectura crece con los anuncios y se queda entre 8 y 25 segundos", () => {
    expect(r.lecturaEsperada(0)).toBe(8_000);
    expect(r.lecturaEsperada(10)).toBe(13_000);
    expect(r.lecturaEsperada(20)).toBe(20_000);
    expect(r.lecturaEsperada(200)).toBe(25_000);
    for (let s = 1; s <= 300; s++) {
      const rng = r.azar(s);
      for (const n of [0, 3, 12, 24, 40]) {
        const p = r.planLectura(n, rng);
        expect(p.ms).toBeGreaterThanOrEqual(8_000);
        expect(p.ms).toBeLessThanOrEqual(25_000);
        // Los tramos suman la lectura, bajan sin volver atrás y el último llega al fondo.
        expect(p.tramos.reduce((t, x) => t + x.ms, 0)).toBe(p.ms);
        expect(p.tramos.length).toBeGreaterThanOrEqual(3);
        expect(p.tramos.length).toBeLessThanOrEqual(8);
        expect(p.tramos.at(-1)!.hasta).toBe(1);
        p.tramos.forEach((t, i) => {
          expect(t.ms).toBeGreaterThan(0);
          expect(t.hasta).toBeGreaterThanOrEqual(0);
          expect(t.hasta).toBeLessThanOrEqual(1);
          if (i > 0) expect(t.hasta).toBeGreaterThanOrEqual(p.tramos[i - 1].hasta);
        });
      }
    }
    // Una página con muchos anuncios se lee por más tramos que una con pocos.
    expect(r.planLectura(32, r.azar(1)).tramos.length).toBeGreaterThan(r.planLectura(4, r.azar(1)).tramos.length);
  });

  it("entre páginas, pausas de 6 a 20 s y un descanso de 45 a 120 s cada 4 a 6 páginas", () => {
    for (let s = 1; s <= 200; s++) {
      const rng = r.azar(s);
      let e = r.ritmoInicial(rng);
      expect(e.paraDescanso).toBeGreaterThanOrEqual(4);
      expect(e.paraDescanso).toBeLessThanOrEqual(6);
      let desdeDescanso = 0;
      for (let pagina = 0; pagina < 30; pagina++) {
        const p = r.siguientePausa(e, rng);
        desdeDescanso++;
        if (p.tipo === "descanso") {
          expect(p.ms).toBeGreaterThanOrEqual(45_000);
          expect(p.ms).toBeLessThanOrEqual(120_000);
          expect(desdeDescanso).toBeGreaterThanOrEqual(4);
          expect(desdeDescanso).toBeLessThanOrEqual(6);
          desdeDescanso = 0;
        } else {
          expect(p.ms).toBeGreaterThanOrEqual(6_000);
          expect(p.ms).toBeLessThanOrEqual(20_000);
          expect(desdeDescanso).toBeLessThan(6);
        }
        // No cambia el estado que recibe.
        expect(p.estado).not.toBe(e);
        e = p.estado;
      }
    }
  });

  it("el azar no es constante: las pausas varían", () => {
    const rng = r.azar(7);
    const pausas = new Set(Array.from({ length: 20 }, () => r.entre(rng, 6_000, 20_000)));
    expect(pausas.size).toBeGreaterThan(10);
  });

  it("tope diario: 24 páginas por día en este Chrome; otro día empieza de cero", () => {
    expect(r.quedanHoy(null, "2026-11-13")).toBe(24);
    let reg: unknown = null;
    for (let i = 0; i < 10; i++) reg = r.anotarPaginaDelDia(reg, "2026-11-13");
    expect(reg).toEqual({ fecha: "2026-11-13", paginas: 10 });
    expect(r.quedanHoy(reg, "2026-11-13")).toBe(14);
    expect(r.quedanHoy(reg, "2026-11-14")).toBe(24);
    expect(r.anotarPaginaDelDia(reg, "2026-11-14")).toEqual({ fecha: "2026-11-14", paginas: 1 });
    expect(r.quedanHoy({ fecha: "2026-11-13", paginas: 99 }, "2026-11-13")).toBe(0);
    expect(r.quedanHoy({ fecha: "2026-11-13", paginas: "x" }, "2026-11-13")).toBe(24);
    expect(r.hoyLocal(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("páginas por búsqueda: 12 como mucho, y no más que lo que queda del día ni que las zonas", () => {
    expect(r.totalEstimado(2, 24)).toBe(12);
    expect(r.totalEstimado(1, 24)).toBe(8);
    expect(r.totalEstimado(3, 5)).toBe(5);
    expect(r.totalEstimado(3, 0)).toBe(0);
    expect(r.totalEstimado(0, 24)).toBe(8);
  });

  it("estima el tiempo que falta para mostrarlo", () => {
    // Promedio por página: carga 4 s + lectura 20 s + pausa 13 s + descanso 82,5 s / 5 = 53,5 s.
    expect(r.estimarRestanteMs(1)).toBe(53_500);
    expect(r.estimarRestanteMs(12)).toBe(642_000);
    expect(r.estimarRestanteMs(0, 30_000)).toBe(30_000);
    expect(r.textoRestante(r.estimarRestanteMs(7))).toBe("quedan ~6 min");
    expect(r.textoRestante(20_000)).toBe("queda menos de 1 min");
    expect(r.textoDuracion(12)).toBe("unos 11 minutos");
    expect(r.textoDuracion(1)).toBe("un minuto");
  });
});
