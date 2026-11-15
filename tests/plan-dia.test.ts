import { describe, expect, it } from "vitest";
import { MAX_RESUMEN_PLAN, armarPlan, horasDeSalida, resumenPlan } from "../lib/asistente/plan";
import { horaCorta } from "../lib/agenda/formato";
import { minutosEntre } from "../lib/agenda/zonas";
import type { DatosPlan } from "../lib/datos/tipos";
import { corredorBase } from "./dobles";

const local = (iso: string) => new Date(`${iso}-06:00`);
const AHORA = local("2026-10-20T07:00");
const corredor = () => ({ ...corredorBase(), zona_base: "Lindora" });

const vacio = (): DatosPlan => ({
  citasHoy: [],
  prospectosNuevos: [],
  conversacionesEscaladas: [],
  borradoresPendientes: 0,
  citasManana: 0,
  visitasSinResultado: [],
  seguimientos: [],
  seguimientosTotal: 0,
  sinRespuesta: [],
  ofertas: [],
  cierres: [],
  duenosNuevos: 0,
  dudasPendientes: 0,
});

const lleno = (): DatosPlan => ({
  citasHoy: [
    { inicio: local("2026-10-20T10:00"), estado: "confirmada", cliente: "Ana Mora", propiedad: "Casa en Escazú", zona: "Escazú" },
    { inicio: local("2026-10-20T14:00"), estado: "agendada", cliente: "Luis Soto", propiedad: "Lote en Santa Ana", zona: "Santa Ana" },
  ],
  prospectosNuevos: ["Marta", "Pedro"],
  conversacionesEscaladas: ["Carlos Rojas"],
  borradoresPendientes: 2,
  citasManana: 1,
  visitasSinResultado: [{ inicio: local("2026-10-19T16:00"), cliente: "Sofía Vargas", propiedad: "Casa en Escazú" }],
  seguimientos: [{ cliente: "Rosa Jiménez", nota: "mandar contrato" }, { cliente: "Juan Pérez", nota: null }],
  seguimientosTotal: 2,
  sinRespuesta: ["Elena Castro"],
  ofertas: [
    { monto: 350_000, moneda: "USD" },
    { monto: 95_000_000, moneda: "CRC" },
  ],
  cierres: [
    { cierre_at: "2026-10-05T18:00:00Z", cierre_comision: 17_500, cierre_moneda: "USD" },
    // Del mes pasado: no cuenta.
    { cierre_at: "2026-09-28T18:00:00Z", cierre_comision: 9_000, cierre_moneda: "USD" },
  ],
  duenosNuevos: 4,
  dudasPendientes: 3,
});

describe("armarPlan (plan del día)", () => {
  it("día vacío: sin visitas, sin secciones vacías y con la pregunta de siempre", () => {
    expect(armarPlan(corredor(), vacio(), AHORA)).toBe(
      [
        "*Buenos días, Patricia.* Tu plan para hoy, martes 20 de octubre:",
        "",
        "Hoy no tienes visitas agendadas.",
        "",
        "¿Tienes algún compromiso hoy o mañana? Escríbeme, por ejemplo, «apartar mañana en la tarde» y no agendo visitas ahí.",
      ].join("\n"),
    );
  });

  it("día completo: visitas con hora de salida, ayer, para hoy, te esperan y el negocio, en ese orden", () => {
    const texto = armarPlan(corredor(), lleno(), AHORA);
    const ida = minutosEntre("Lindora", "Escazú")!;
    const entre = minutosEntre("Escazú", "Santa Ana")!;
    const hora = (iso: string, menos: number) => horaCorta(new Date(local(iso).getTime() - menos * 60_000), "America/Costa_Rica");
    expect(texto).toContain("*Visitas de hoy (2)*");
    expect(texto).toContain("• 10:00 a. m. · Ana Mora · Casa en Escazú (confirmada)");
    expect(texto).toContain(`_Sal de Lindora a las ${hora("2026-10-20T10:00", ida)} (${ida} min)_`);
    expect(texto).toContain("• 2:00 p. m. · Luis Soto · Lote en Santa Ana (por confirmar)");
    expect(texto).toContain(`_Sal ${hora("2026-10-20T14:00", entre).startsWith("1:") ? "a la" : "a las"} ${hora("2026-10-20T14:00", entre)} (${entre} min desde la anterior)_`);
    expect(texto).toContain("Mañana tienes 1 visita.");
    expect(texto).toContain("*¿Cómo salieron las de ayer?* Respóndeme y lo anoto.\n• 4:00 p. m. · Sofía Vargas · Casa en Escazú");
    expect(texto).toContain("• Llamar (2): Rosa Jiménez (mandar contrato), Juan Pérez");
    expect(texto).toContain("• No contestan hace 3 días: Elena Castro");
    expect(texto).toContain("• 2 respuestas por aprobar");
    expect(texto).toContain("• Quieren hablar contigo (1): Carlos Rojas");
    expect(texto).toContain("• 3 preguntas que no supe contestar");
    expect(texto).toContain("• Ganado este mes: $17.500 (1 cierre)");
    expect(texto).toContain("• Prospectos nuevos (2): Marta, Pedro");
    expect(texto).toContain("• 4 dueños directos nuevos esta semana");
    expect(texto.endsWith("«apartar mañana en la tarde» y no agendo visitas ahí.")).toBe(true);

    const orden = ["*Visitas de hoy", "*¿Cómo salieron", "*Para hoy*", "*Te esperan*", "*Tu negocio*", "¿Tienes algún compromiso"].map((t) =>
      texto.indexOf(t),
    );
    expect(orden.every((x, i) => x >= 0 && (i === 0 || x > orden[i - 1]))).toBe(true);
    expect(texto.split("\n").length).toBeLessThanOrEqual(30);
  });

  it("dólares y colones nunca se suman: cada moneda por su lado", () => {
    const datos = { ...vacio(), ofertas: lleno().ofertas.concat({ monto: 50_000, moneda: "USD" }) };
    datos.cierres = [
      { cierre_at: "2026-10-05T18:00:00Z", cierre_comision: 10_000, cierre_moneda: "USD" },
      { cierre_at: "2026-10-06T18:00:00Z", cierre_comision: 2_500_000, cierre_moneda: "CRC" },
    ];
    const texto = armarPlan(corredor(), datos, AHORA);
    expect(texto).toContain("• Ofertas en negociación (3): $400.000 · ₡95.000.000");
    expect(texto).toContain("• Ganado este mes: $10.000 · ₡2.500.000 (2 cierres)");
    expect(texto).not.toMatch(/95\.400\.000|2\.510\.000/);
  });

  it("el mes de lo ganado es el local: un cierre del 31 de octubre a las 18:30 en Costa Rica es de octubre", () => {
    const datos = { ...vacio(), cierres: [{ cierre_at: "2026-11-01T00:30:00Z", cierre_comision: 5_000, cierre_moneda: "USD" }] };
    expect(armarPlan(corredor(), datos, local("2026-10-31T20:00"))).toContain("Ganado este mes: $5.000");
    expect(armarPlan(corredor(), datos, local("2026-11-02T07:00"))).not.toContain("Ganado");
  });

  it("omite cada sección vacía", () => {
    const soloEsperan = { ...vacio(), borradoresPendientes: 1 };
    const texto = armarPlan(corredor(), soloEsperan, AHORA);
    expect(texto).toContain("*Te esperan*\n• 1 respuesta por aprobar");
    for (const t of ["*Para hoy*", "*Tu negocio*", "¿Cómo salieron", "Ofertas", "Ganado", "Prospectos", "dueños", "Llamar", "No contestan"]) {
      expect(texto).not.toContain(t);
    }
    expect(texto).not.toMatch(/\n\n\n/);
  });

  it("sin zona base ni zona de la casa no inventa hora de salida", () => {
    const datos = { ...vacio(), citasHoy: [{ inicio: local("2026-10-20T10:00"), estado: "agendada" as const, cliente: "Ana", propiedad: null }] };
    expect(armarPlan(corredorBase(), datos, AHORA)).not.toContain("Sal ");
    expect(horasDeSalida([{ inicio: local("2026-10-20T10:00"), zona: "Escazú" }], null, "America/Costa_Rica")).toEqual([null]);
  });

  it("con muchas visitas no pasa de unas 25 líneas", () => {
    const citas = Array.from({ length: 9 }, (_, i) => ({
      inicio: local(`2026-10-20T${String(8 + i).padStart(2, "0")}:00`),
      estado: "agendada" as const,
      cliente: `Cliente ${i}`,
      propiedad: "Casa",
      zona: "Escazú",
    }));
    const texto = armarPlan(corredor(), { ...lleno(), citasHoy: citas }, AHORA);
    expect(texto).toContain("• y 4 más en tu agenda");
    expect(texto.split("\n").length).toBeLessThanOrEqual(36);
  });
});

describe("resumenPlan (plantilla con la ventana cerrada)", () => {
  it("lleva las cifras clave, en menos de 300 caracteres y sin nombres de clientes ni montos", () => {
    const datos = lleno();
    const texto = resumenPlan(corredor(), datos);
    expect(texto.length).toBeLessThan(MAX_RESUMEN_PLAN + 1);
    expect(texto).toContain("Tu plan de hoy: 2 visitas hoy");
    expect(texto).toContain("1 visita de ayer por anotar");
    expect(texto).toContain("2 por llamar");
    expect(texto).toContain("2 por aprobar");
    expect(texto).toContain("4 dueños nuevos");
    for (const nombre of ["Ana", "Luis", "Marta", "Pedro", "Carlos", "Sofía", "Rosa", "Juan", "Elena"]) expect(texto).not.toContain(nombre);
    expect(texto).not.toMatch(/[$₡]/);
    expect(texto).not.toContain("\n");
  });

  it("con un nombre de corredor larguísimo igual queda bajo el límite", () => {
    const texto = resumenPlan({ ...corredor(), nombre_contacto: "P".repeat(200) }, lleno());
    expect(texto.length).toBeLessThanOrEqual(MAX_RESUMEN_PLAN);
    expect(texto).toContain("2 visitas hoy");
  });

  it("día vacío", () => {
    expect(resumenPlan(corredor(), vacio())).toBe(
      "Buenos días, Patricia. Tu plan de hoy: 0 visitas hoy, 0 prospectos nuevos. Respóndeme cualquier cosa y te lo mando completo.",
    );
  });
});
