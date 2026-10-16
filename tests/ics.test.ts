import { describe, expect, it } from "vitest";
import { calendarioIcs } from "../lib/agenda/ics";

describe("calendarioIcs", () => {
  const ics = calendarioIcs(
    "Deluxe Properties",
    [
      {
        id: "abc",
        inicio: new Date("2026-10-21T16:00:00Z"),
        fin: new Date("2026-10-21T17:00:00Z"),
        estado: "confirmada",
        cliente_nombre: "Ana, la de Escazú",
        cliente_telefono: "+50688880001",
        propiedad_titulo: "Casa en condominio; con piscina y una descripción bastante larga para obligar el plegado",
        propiedad_codigo: "DLX-1",
        notas: null,
        updated_at: new Date("2026-10-20T00:00:00Z"),
      },
    ],
    new Date("2026-10-20T12:00:00Z"),
  );

  it("arma un VEVENT con fechas en UTC y estado", () => {
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART:20261021T160000Z");
    expect(ics).toContain("DTEND:20261021T170000Z");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("UID:abc@asistente");
  });

  it("escapa comas y punto y coma, y pliega líneas largas", () => {
    expect(ics).toContain("Ana\\, la de Escazú");
    // (antes "\;" en el código era solo ";": el punto y coma no se escapaba)
    expect(ics.replace(/\r\n /g, "")).toContain("condominio\\; con piscina");
    for (const linea of ics.split("\r\n")) {
      expect(new TextEncoder().encode(linea).length).toBeLessThanOrEqual(75);
    }
  });

  it("escapa punto y coma y saltos de línea (también un \\r suelto) en lo que escribe el cliente", () => {
    const otro = calendarioIcs(
      "Deluxe",
      [
        {
          id: "x",
          inicio: new Date("2026-10-21T16:00:00Z"),
          fin: new Date("2026-10-21T17:00:00Z"),
          estado: "agendada",
          cliente_nombre: "Ana\rATTENDEE:mailto:x@y.z",
          cliente_telefono: "+50688880001",
          propiedad_titulo: null,
          propiedad_codigo: null,
          notas: "uno; dos",
          updated_at: new Date("2026-10-20T00:00:00Z"),
        },
      ],
      new Date("2026-10-20T12:00:00Z"),
    );
    expect(otro).not.toMatch(/\r(?!\n)/);
    expect(otro).not.toMatch(/\r\nATTENDEE/);
    expect(otro.replace(/\r\n /g, "")).toContain("uno\\; dos");
  });
});
