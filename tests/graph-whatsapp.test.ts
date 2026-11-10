import { describe, expect, it, vi } from "vitest";
import { appsSuscritas, configurarWebhook, estadoNumero, registrarNumero } from "../lib/whatsapp/graph";

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });

describe("Graph API de WhatsApp (administración)", () => {
  it("estadoNumero devuelve los datos del número", async () => {
    const f = vi.fn(async () => json({ display_phone_number: "+1 555 168 7751", status: "CONNECTED" }));
    const r = await estadoNumero("TOKEN", "123", f as never);
    expect(r).toEqual({ ok: true, datos: { display_phone_number: "+1 555 168 7751", status: "CONNECTED" } });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: "Bearer TOKEN" });
  });

  it("si un campo no existe (error 100) reintenta con los básicos", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: 100 } }, 400))
      .mockResolvedValueOnce(json({ display_phone_number: "+1 555" }));
    const r = await estadoNumero("T", "123", f as never);
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[1][0])).toContain("fields=display_phone_number,verified_name");
  });

  it("un error de Meta devuelve estado y código, sin texto", async () => {
    const f = vi.fn(async () => json({ error: { code: 133010, message: "dato privado +50688880001" } }, 400));
    const r = await registrarNumero("T", "123", "123456", f as never);
    expect(r).toEqual({ ok: false, status: 400, codigo: 133010 });
    expect(JSON.stringify(r)).not.toContain("50688880001");
  });

  it("registrarNumero manda el PIN en el cuerpo y no en la dirección", async () => {
    const f = vi.fn(async () => json({ success: true }));
    await registrarNumero("T", "123", "654321", f as never);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("654321");
    expect(String(init.body)).toContain("pin=654321");
    expect(init.method).toBe("POST");
  });

  it("configurarWebhook usa el token de la app (id|secreto) y pide el campo messages", async () => {
    const f = vi.fn(async () => json({ success: true }));
    await configurarWebhook("APP", "SEC", "https://x.test/api/whatsapp/webhook", "verifica", f as never);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/APP/subscriptions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer APP|SEC" });
    const cuerpo = new URLSearchParams(String(init.body));
    expect(cuerpo.get("fields")).toBe("messages");
    expect(cuerpo.get("object")).toBe("whatsapp_business_account");
  });

  it("una red caída no lanza: devuelve estado 0", async () => {
    const f = vi.fn(async () => {
      throw new Error("red");
    });
    expect(await appsSuscritas("T", "W", f as never)).toEqual({ ok: false, status: 0 });
  });
});
