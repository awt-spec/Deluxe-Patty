import { describe, expect, it, vi } from "vitest";
import { yaTocaPlan } from "../lib/asistente/plan";
import { mandarResumen } from "../lib/google/tareas";
import { supabaseFalso } from "./acciones/entorno";

// Costa Rica es UTC-6 todo el año; el servidor corre en UTC.
const local = (iso: string) => new Date(`${iso}-06:00`);
const corredor = (hora: string) => ({ zona_horaria: "America/Costa_Rica", hora_plan_dia: hora });

/** En qué corridas del día (cron cada `paso` minutos, hora local) saldría por primera vez el plan. */
function primeraCorrida(hora: string, dia: string, paso = 60): string | null {
  for (let m = 0; m < 24 * 60; m += paso) {
    const hh = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (yaTocaPlan(corredor(hora), local(`${dia}T${hh}`), paso)) return hh;
  }
  return null;
}

describe("plan del día: sale aunque la hora elegida no sea en punto", () => {
  it("con el cron de cada hora: 07:00 a las 7, 07:30 a las 8, 23:30 y 23:46 a las 23", () => {
    expect(primeraCorrida("07:00", "2026-11-16")).toBe("07:00");
    expect(primeraCorrida("07:30", "2026-11-16")).toBe("08:00");
    expect(primeraCorrida("23:30", "2026-11-16")).toBe("23:00");
    expect(primeraCorrida("23:46", "2026-11-16")).toBe("23:00");
    expect(primeraCorrida("00:15", "2026-11-16")).toBe("01:00");
  });

  it("con el cron de Google (cada 15 min): 23:46 a las 23:45 y 07:30 a las 7:30", () => {
    expect(primeraCorrida("23:46", "2026-11-16", 15)).toBe("23:45");
    expect(primeraCorrida("07:30", "2026-11-16", 15)).toBe("07:30");
    expect(primeraCorrida("07:31", "2026-11-16", 15)).toBe("07:45");
  });

  it("al cambiar de día vuelve a esperar la hora (el de ayer no se arrastra) y acepta horas con segundos", () => {
    expect(yaTocaPlan(corredor("23:30"), local("2026-11-16T23:00"))).toBe(true);
    expect(yaTocaPlan(corredor("23:30"), local("2026-11-17T00:00"))).toBe(false);
    expect(yaTocaPlan(corredor("07:30:00"), local("2026-11-17T07:00"))).toBe(false);
    expect(yaTocaPlan(corredor("07:30:00"), local("2026-11-17T08:00"))).toBe(true);
    // Sin hora guardada se usa la de siempre (07:00).
    expect(yaTocaPlan(corredor(""), local("2026-11-17T07:00"))).toBe(true);
  });

  it("el resumen por correo de Google usa la misma regla: 23:46 sale en la corrida de las 23:45 (una vez)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const db = supabaseFalso({ google_conexiones: [{ corredor_id: "c1", resumen_enviado_fecha: null }] });
    const deps = { repo: { datosPlan: async () => ({ citas: [], seguimientos: [], recordatorios: [] }) } } as never;
    const c = { id: "c1", nombre_contacto: "Patricia", ...corredor("23:46") } as never;
    const conexion = { correo: "p@ejemplo.com", acceso: async () => "token" } as never;
    expect(await mandarResumen(deps, db as never, c, conexion, local("2026-11-16T23:30"))).toBe(false);
    expect(db.tablas.google_conexiones[0].resumen_enviado_fecha).toBeNull();
    // A las 23:45 ya le toca: marca la fecha antes de mandar (así la corrida siguiente no lo repite).
    await mandarResumen(deps, db as never, c, conexion, local("2026-11-16T23:45")).catch(() => false);
    expect(db.tablas.google_conexiones[0].resumen_enviado_fecha).toBe("2026-11-16");
    vi.unstubAllGlobals();
  });
});
