import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { decidirSinSesion, destinoEntrar, esRutaInterna, hayCookieDeSesion, rutaParaVolver, volverDesdeReferer } from "@/lib/panel/sesion-vencida";
import { respuestaSinSesion } from "@/lib/panel/proxy-sesion";

const COOKIE = "sb-abcd-auth-token";

describe("esRutaInterna: solo pantallas del panel (nada de redirección abierta)", () => {
  it.each(["/panel", "/panel/ajustes", "/panel/clientes/123?tipo=compras", "/panel/agenda?vista=mes#hoy"])("acepta %s", (r) => {
    expect(esRutaInterna(r)).toBe(true);
  });
  it.each([
    "",
    "/",
    "panel",
    "/panelx",
    "/admin",
    "//evil.example/panel",
    "/\\evil.example",
    "/panel//evil.example",
    "/panel/../admin",
    "/panel/%2e%2e/admin",
    "/panel/%2f%2fevil",
    "/panel/%5cevil",
    "https://evil.example/panel",
    "javascript:alert(1)",
    "/panel/\nx",
    "/panel/ x",
    "/panel/%",
    `/panel/${"a".repeat(600)}`,
  ])("rechaza %j", (r) => {
    expect(esRutaInterna(r)).toBe(false);
  });
  it("rechaza lo que no es texto", () => {
    expect(esRutaInterna(undefined)).toBe(false);
    expect(esRutaInterna(["/panel"])).toBe(false);
  });
});

describe("a dónde va quien perdió la sesión", () => {
  it("quita el _rsc de Next y no repite /panel", () => {
    expect(rutaParaVolver("/panel/ajustes", "?_rsc=abc")).toBe("/panel/ajustes");
    expect(rutaParaVolver("/panel/clientes", "?tipo=compras&_rsc=1")).toBe("/panel/clientes?tipo=compras");
    expect(rutaParaVolver("/panel", "")).toBeNull();
    expect(rutaParaVolver("/admin/accesos", "")).toBeNull();
  });
  it("arma /entrar con el aviso solo si había sesión", () => {
    expect(destinoEntrar("/panel/ajustes", true)).toBe("/entrar?aviso=sesion&volver=%2Fpanel%2Fajustes");
    expect(destinoEntrar(null, false)).toBe("/entrar");
    expect(destinoEntrar("//evil.example", true)).toBe("/entrar?aviso=sesion");
  });
  it("reconoce la cookie de Supabase, también en trozos", () => {
    expect(hayCookieDeSesion([COOKIE])).toBe(true);
    expect(hayCookieDeSesion(["sb-abcd-auth-token.0", "otra"])).toBe(true);
    expect(hayCookieDeSesion(["corredor"])).toBe(false);
  });
  it("del Referer, solo una ruta del panel del mismo sitio", () => {
    expect(volverDesdeReferer("https://app.example/panel/ajustes?x=1", "https://app.example")).toBe("/panel/ajustes?x=1");
    expect(volverDesdeReferer("https://evil.example/panel/ajustes", "https://app.example")).toBeNull();
    expect(volverDesdeReferer("no es url", null)).toBeNull();
    expect(volverDesdeReferer(null, null)).toBeNull();
  });
});

describe("decidirSinSesion", () => {
  const base = { headers: new Headers(), pathname: "/panel/ajustes", search: "", cookies: [COOKIE] };
  it("una acción del servidor (Next-Action) no recibe una redirección 30x", () => {
    const r = decidirSinSesion({ ...base, method: "POST", headers: new Headers({ "next-action": "7f00" }) });
    expect(r).toEqual({ tipo: "accion", destino: "/entrar?aviso=sesion&volver=%2Fpanel%2Fajustes" });
  });
  it("un formulario sin JavaScript (POST normal) va con 303 para que el navegador pida /entrar con GET", () => {
    expect(decidirSinSesion({ ...base, method: "POST" })).toMatchObject({ tipo: "redirigir", estado: 303 });
  });
  it("una página va con 307; sin cookie de sesión no dice «se cerró»", () => {
    expect(decidirSinSesion({ ...base, method: "GET", cookies: [] })).toEqual({ tipo: "redirigir", destino: "/entrar?volver=%2Fpanel%2Fajustes", estado: 307 });
  });
});

describe("respuestaSinSesion (lo que contesta el proxy)", () => {
  it("a una acción: 401 con x-action-redirect, que el cliente de Next convierte en navegación a /entrar", () => {
    const req = new NextRequest("https://app.example/panel/clientes/nuevo", {
      method: "POST",
      headers: { "next-action": "7f00", cookie: `${COOKIE}=viejo` },
    });
    const res = respuestaSinSesion(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-action-redirect")).toBe("/entrar?aviso=sesion&volver=%2Fpanel%2Fclientes%2Fnuevo;replace");
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
  });
  it("a una página: redirección a /entrar del mismo sitio", () => {
    const req = new NextRequest("https://app.example/panel/agenda?vista=mes", { headers: { cookie: `${COOKIE}=viejo` } });
    const res = respuestaSinSesion(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example/entrar?aviso=sesion&volver=%2Fpanel%2Fagenda%3Fvista%3Dmes");
  });
  it("al panel sin haber entrado nunca: /entrar a secas", () => {
    const res = respuestaSinSesion(new NextRequest("https://app.example/panel"));
    expect(res.headers.get("location")).toBe("https://app.example/entrar");
  });
});
