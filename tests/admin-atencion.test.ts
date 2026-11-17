import { describe, expect, it } from "vitest";
import { describirAlerta, estadoCorredor, estadoWhatsApp, iniciales, listaAtencion } from "../lib/admin/atencion";
import type { FilaAdmin } from "../lib/admin/datos";

const fila = (c: Partial<FilaAdmin["c"]> = {}, f: Partial<FilaAdmin> = {}): FilaAdmin =>
  ({
    c: {
      id: "x", slug: "x", nombre: "Deluxe", nombre_contacto: "P", activo: true, zona_horaria: "America/Costa_Rica", tope_mensajes_mes: 1000,
      aviso_mensajes_mes: 900, respuesta_automatica: true, whatsapp_numero: null, whatsapp_phone_number_id: "123456", whatsapp_corredor: "+50688887777",
      tope_ia_dia_usd: null, tope_ia_mes_usd: null, nombre_asistente: "Patty", imagenes_activas: true, ...c,
    },
    mensajesMes: 10, gastoHoy: 1, gastoMes: 10, topeDia: 10, topeMes: 150, entrantes24h: 3, ultimoEntrante: "2026-11-17T10:00:00Z", ...f,
  }) as FilaAdmin;
const llaves = { token: true, secreto: true, verificacion: true };

describe("/admin: lo que pide atención", () => {
  it("sin nada pendiente, la lista queda vacía", () => {
    expect(listaAtencion([fila()], llaves)).toEqual([]);
  });

  it("lo urgente va primero y cada cosa trae su botón", () => {
    const a = listaAtencion([fila({ respuesta_automatica: false, whatsapp_corredor: null }), fila({ nombre: "Otro", whatsapp_phone_number_id: null })], { ...llaves, token: false });
    expect(a.map((x) => x.tono)).toEqual(["mal", "mal", "poco", "info"]);
    expect(a[0]).toMatchObject({ titulo: "Falta WHATSAPP_ACCESS_TOKEN", href: "/admin/whatsapp", accion: "Ver WhatsApp" });
    expect(a[1]).toMatchObject({ accion: "Poner el número" });
  });

  it("frenado por tope y cerca del tope; los inactivos no piden atención", () => {
    expect(listaAtencion([fila({}, { gastoMes: 150 })], llaves)[0]).toMatchObject({ tono: "mal", href: "/admin/corredores/x#ia" });
    expect(listaAtencion([fila({}, { gastoHoy: 8.5 })], llaves)[0]).toMatchObject({ tono: "poco" });
    expect(listaAtencion([fila({ activo: false, whatsapp_phone_number_id: null })], llaves)).toEqual([]);
  });
});

describe("/admin: estados y alertas", () => {
  it("estado del corredor y de su WhatsApp", () => {
    expect(estadoCorredor(fila()).texto).toBe("Activo");
    expect(estadoCorredor(fila({ activo: false })).texto).toBe("Demo");
    expect(estadoCorredor(fila({}, { topeMes: 0 })).texto).toBe("Pausado");
    expect(estadoWhatsApp(fila({ whatsapp_phone_number_id: null })).tono).toBe("mal");
    expect(estadoWhatsApp(fila({}, { ultimoEntrante: null })).tono).toBe("poco");
    expect(estadoWhatsApp(fila()).tono).toBe("bien");
  });

  it("nombra las alertas en palabras y quita el número final", () => {
    expect(describirAlerta("error_whatsapp_config:131030")).toEqual({ titulo: "WhatsApp: falla de cuenta o plantilla", clave: "error_whatsapp_config", tono: "mal" });
    expect(describirAlerta("algo_nuevo").tono).toBe("gris");
  });

  it("iniciales del corredor o del correo", () => {
    expect(iniciales("Deluxe Properties")).toBe("DP");
    expect(iniciales("patricia.mora@deluxe.cr")).toBe("PM");
    expect(iniciales("")).toBe("?");
  });
});
