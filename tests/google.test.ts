import { describe, expect, it } from "vitest";
import { cifrar, descifrar } from "../lib/google/cifrado";
import { armarCorreo, leerCorreo, urlConsentimiento } from "../lib/google/google";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("Google", () => {
  it("cifra y descifra el permiso con la llave del servidor", () => {
    process.env.GOOGLE_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
    const guardado = cifrar("1//refresh-token");
    expect(guardado).not.toContain("refresh");
    expect(descifrar(guardado)).toBe("1//refresh-token");
    // Un permiso alterado no se descifra.
    const [iv, tag, datos] = guardado.split(".");
    expect(() => descifrar([iv, tag, datos.slice(0, -2) + "AA"].join("."))).toThrow();
  });

  it("pide permiso permanente y solo lo necesario", () => {
    const url = new URL(urlConsentimiento({ clienteId: "id", secreto: "s", vuelta: "https://x.app/api/google/vuelta" }, "estado"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("gmail.modify");
    expect(url.searchParams.get("scope")).toContain("calendar.events");
    expect(url.searchParams.get("state")).toBe("estado");
  });

  it("arma un correo con tildes y en respuesta al hilo", () => {
    const crudo = Buffer.from(armarCorreo({ para: "ana@correo.com", asunto: "Re: Casa en Escazú", texto: "Hola, ¿cómo está?", enRespuestaA: "<abc@mail>" }), "base64url").toString("utf8");
    expect(crudo).toContain("To: ana@correo.com");
    expect(crudo).toContain("In-Reply-To: <abc@mail>");
    const cuerpo = crudo.split("\r\n\r\n")[1];
    expect(Buffer.from(cuerpo, "base64").toString("utf8")).toBe("Hola, ¿cómo está?");
  });

  it("lee el texto de un correo de Gmail (texto plano o HTML)", async () => {
    const respuesta = {
      id: "m1",
      threadId: "t1",
      internalDate: "1762450000000",
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: "Ana Solís <Ana@Correo.com>" },
          { name: "Subject", value: "Consulta" },
          { name: "Message-ID", value: "<x@mail>" },
        ],
        parts: [{ mimeType: "text/html", body: { data: b64url("<p>Busco casa<br>en Escazú</p>") } }],
      },
    };
    const f = (async () => new Response(JSON.stringify(respuesta))) as unknown as typeof fetch;
    const c = await leerCorreo("token", "m1", f);
    expect(c).toMatchObject({ id: "m1", hilo: "t1", correoDe: "ana@correo.com", asunto: "Consulta", messageId: "<x@mail>" });
    expect(c.texto).toContain("Busco casa\nen Escazú");
  });
});
