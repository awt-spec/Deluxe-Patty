import { describe, expect, it } from "vitest";
import {
  alAtras,
  alElegir,
  alEmpezarDeNuevo,
  alSiguiente,
  anteriorPaso,
  clavePasos,
  numeroDePaso,
  ocultarHasta,
  pasoGuardado,
  pasoVisible,
  primerNoCumplido,
  siguientePaso,
  sigueOculta,
} from "@/lib/panel/pasos";
import { comoLeHaIdo, estadoPuesta, MINIMO_REVISADAS, type DatosPuesta } from "@/lib/panel/puesta";

const PASOS = ["casas", "fichas", "horario", "tono", "listo"] as const;
type P = (typeof PASOS)[number];
const hechos = (...h: P[]) => (p: P) => h.includes(p);

describe("Asistente paso a paso: reglas comunes", () => {
  it("siguiente y anterior no se salen de la lista", () => {
    expect(siguientePaso(PASOS, "casas")).toBe("fichas");
    expect(siguientePaso(PASOS, "listo")).toBe("listo");
    expect(anteriorPaso(PASOS, "fichas")).toBe("casas");
    expect(anteriorPaso(PASOS, "casas")).toBe("casas");
  });

  it("el primer paso que falta, y la pantalla final si no falta ninguno", () => {
    expect(primerNoCumplido(PASOS, hechos())).toBe("casas");
    expect(primerNoCumplido(PASOS, hechos("casas", "fichas"))).toBe("horario");
    expect(primerNoCumplido(PASOS, hechos("casas", "fichas", "horario", "tono"))).toBe("listo");
    // Desde un paso elegido solo mira hacia adelante.
    expect(primerNoCumplido(PASOS, hechos("tono"), "tono")).toBe("listo");
  });

  it("sin elección abre en lo primero que falta y avanza solo cuando los datos lo marcan", () => {
    const sinNada = { elegido: null, volvioAtras: false };
    expect(pasoVisible(PASOS, sinNada, hechos("casas"))).toBe("fichas");
    // Estaba en "fichas" (guardado) y ya subió las fotos: salta a horario.
    expect(pasoVisible(PASOS, { elegido: "fichas", volvioAtras: false }, hechos("casas", "fichas"))).toBe("horario");
  });

  it("respeta el Atrás aunque ese paso ya esté hecho", () => {
    const e = alAtras(PASOS, "horario");
    expect(e).toEqual({ elegido: "fichas", volvioAtras: true });
    expect(pasoVisible(PASOS, e, hechos("casas", "fichas"))).toBe("fichas");
    // Al volver a tocar Siguiente, vuelve el avance automático.
    const s = alSiguiente(PASOS, "fichas");
    expect(s.volvioAtras).toBe(false);
    expect(pasoVisible(PASOS, s, hechos("casas", "fichas", "horario"))).toBe("tono");
  });

  it("tocar el progreso: hacia atrás se respeta, hacia adelante no", () => {
    expect(alElegir(PASOS, "tono", "casas")).toEqual({ elegido: "casas", volvioAtras: true });
    expect(alElegir(PASOS, "casas", "tono")).toEqual({ elegido: "tono", volvioAtras: false });
    expect(pasoVisible(PASOS, alEmpezarDeNuevo(PASOS), hechos("casas", "fichas", "horario", "tono"))).toBe("casas");
  });

  it("Paso N de M sin contar la pantalla final", () => {
    expect(numeroDePaso(PASOS, "casas")).toEqual({ numero: 1, total: 4 });
    expect(numeroDePaso(PASOS, "listo")).toEqual({ numero: 4, total: 4 });
  });

  it("clave de guardado por guía y por id, sin caracteres raros", () => {
    expect(clavePasos("empezar")).toBe("pasos:empezar");
    expect(clavePasos("anuncio", "60000000-0000-4000-8000-000000000001")).toBe("pasos:anuncio:60000000-0000-4000-8000-000000000001");
    expect(clavePasos("Anuncio", "a b/../c")).toBe("pasos:anuncio:abc");
  });

  it("lo guardado solo vale si es un paso de la guía; el final no vale si algo dejó de estar hecho", () => {
    expect(pasoGuardado(PASOS, "tono")).toBe("tono");
    expect(pasoGuardado(PASOS, "descargar")).toBeNull();
    expect(pasoGuardado(PASOS, null)).toBeNull();
    expect(pasoGuardado(PASOS, "listo", hechos("casas"))).toBeNull();
    expect(pasoGuardado(PASOS, "listo", hechos("casas", "fichas", "horario", "tono"))).toBe("listo");
    expect(pasoGuardado(PASOS, "listo")).toBe("listo");
  });

  it("Más tarde esconde la tarjeta tres días", () => {
    const ahora = Date.UTC(2026, 10, 13);
    const hasta = ocultarHasta(ahora);
    expect(sigueOculta(hasta, ahora + 2 * 86_400_000)).toBe(true);
    expect(sigueOculta(hasta, ahora + 3 * 86_400_000 + 1)).toBe(false);
    expect(sigueOculta(null, ahora)).toBe(false);
    expect(sigueOculta("basura", ahora)).toBe(false);
  });
});

describe("Puesta en marcha: qué está hecho, con las reglas del Cerebro", () => {
  const base: DatosPuesta = { casas: [], franjas: 0, tono: "", temas: [], google: false };

  it("sin nada: 0 de 6 y la tarjeta sigue", () => {
    const e = estadoPuesta(base);
    expect(e).toMatchObject({ listos: 0, total: 6, completa: false, hechos: [] });
  });

  it("casas sin precio o sin fotos no cuentan como fichas listas, y se listan", () => {
    const e = estadoPuesta({
      ...base,
      casas: [
        { id: "a", titulo: "Casa A", codigo: "A", precio: 100, fotos: 3 },
        { id: "b", titulo: "Casa B", codigo: "B", precio: null, fotos: 2 },
      ],
    });
    expect(e.hechos).toEqual(["casas"]);
    expect(e.incompletas.map((c) => c.id)).toEqual(["b"]);
  });

  it("Google es opcional: con lo obligatorio hecho la puesta queda completa (5 de 6)", () => {
    const e = estadoPuesta({ casas: [{ id: "a", titulo: "A", codigo: "A", precio: 1, fotos: 1 }], franjas: 3, tono: "Cordial", temas: ["Comisiones"], google: false });
    expect(e).toMatchObject({ listos: 5, completa: true });
    expect(estadoPuesta({ ...base, google: true, tono: "  " }).hechos).toEqual(["google"]);
  });
});

describe("¿Lista para contestar sola?: cifras contadas, sin inventar", () => {
  it("con pocas respuestas lo dice", () => {
    const v = comoLeHaIdo({ aprobadas: 3, corregidas: 1, descartadas: 0 }, "Patty");
    expect(v.tono).toBe("pocas");
    expect(v.titulo).toBe("Todavía son pocas respuestas para saberlo");
    expect(v.detalle).toContain("4 respuestas");
    expect(comoLeHaIdo({ aprobadas: 0, corregidas: 0, descartadas: 0 }, "Patty").detalle).toContain("no revisaste");
  });

  it("muchas aprobadas sin cambios: parece lista; muchas corregidas: todavía no", () => {
    const lista = comoLeHaIdo({ aprobadas: 18, corregidas: 2, descartadas: 0 }, "Patty");
    expect(lista).toMatchObject({ tono: "lista", total: 20, bien: 90 });
    expect(comoLeHaIdo({ aprobadas: 14, corregidas: 5, descartadas: 1 }, "Patty").tono).toBe("casi");
    expect(comoLeHaIdo({ aprobadas: 5, corregidas: 10, descartadas: 5 }, "Patty").tono).toBe("todavia");
    expect(MINIMO_REVISADAS).toBeGreaterThan(0);
  });
});
