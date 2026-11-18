import { describe, expect, it } from "vitest";
import { armarListaDuenos } from "@/lib/encuentra24/busqueda";
import { anunciosDePagina, fotosDeAnuncio } from "@/lib/encuentra24/parsear";
import { esFotoDeE24, leerSenales, senalesParaGuardar, textosDeSenales } from "@/lib/encuentra24/senales";
import { ladoDeSenal, medidorConfianza, razonesDueno } from "@/lib/panel/duenos";
import { datosParaMensaje, mensajesDeCodigo, revisarMensajes, traeCifraInventada } from "@/lib/panel/mensaje-dueno";
import { anuncioE24, paginaE24 } from "./fixtures/e24";

const FOTO = (n: number) => `https://photos.encuentra24.com/t_or_fh_m/f_auto/v1/cr/31/23/45/67/31234567_${n}.jpg`;

describe("señales de un dueño: a favor o en contra", () => {
  it("las del pantallazo de Patricia", () => {
    expect(ladoDeSenal("Se declara Propietario")).toBe("pro");
    expect(ladoDeSenal("Nombre de persona con una sola propiedad publicada")).toBe("pro");
    expect(ladoDeSenal("El texto tiene tono comercial de agencia")).toBe("contra");
  });

  it("lo que nombra a la agencia pero cuenta a favor, y lo que deja dudas", () => {
    expect(ladoDeSenal("Trato directo, sin intermediarios")).toBe("pro");
    expect(ladoDeSenal("No menciona comisión")).toBe("pro");
    expect(ladoDeSenal("texto en primera persona")).toBe("pro");
    expect(ladoDeSenal("Publica varias propiedades")).toBe("contra");
    expect(ladoDeSenal("Cuenta de empresa con licencia")).toBe("contra");
    expect(ladoDeSenal("No dice si es el dueño")).toBe("contra");
    expect(ladoDeSenal("Anuncio destacado pagado")).toBe("contra");
    // Lo que no se entiende queda a favor (la revisión ya decidió que es el dueño).
    expect(ladoDeSenal("Casa con jardín")).toBe("pro");
  });

  it("razones: las nuevas traen su lado; las viejas se clasifican; hasta 3 por lado, con mayúscula", () => {
    const r = razonesDueno([
      { texto: "se declara Propietario", lado: null },
      { texto: "Tono comercial", lado: "contra" },
      { texto: "Habla de comisión", lado: "pro" },
      { texto: "una sola propiedad", lado: null },
      { texto: "texto en primera persona", lado: null },
      { texto: "detalles personales de la casa", lado: null },
    ]);
    expect(r.aFavor).toEqual(["Se declara Propietario", "Habla de comisión", "Una sola propiedad"]);
    expect(r.enContra).toEqual(["Tono comercial"]);
  });

  it("el medidor: muy probable, probable, hay dudas, poco probable y sin revisar", () => {
    expect(medidorConfianza(82)).toEqual({ pct: 82, etiqueta: "Muy probable", tono: "verde" });
    expect(medidorConfianza(64)).toMatchObject({ etiqueta: "Probable", tono: "azul" });
    expect(medidorConfianza(41)).toMatchObject({ etiqueta: "Hay dudas", tono: "ambar" });
    expect(medidorConfianza(90, false)).toMatchObject({ etiqueta: "Poco probable" });
    expect(medidorConfianza(140).pct).toBe(100);
    expect(medidorConfianza(null)).toEqual({ pct: null, etiqueta: "Sin revisar", tono: "gris" });
  });
});

describe("fotos del anuncio guardadas en senales", () => {
  it("solo https de *.encuentra24.com", () => {
    expect(esFotoDeE24(FOTO(1))).toBe(true);
    expect(esFotoDeE24("https://encuentra24.com/a.jpg")).toBe(true);
    expect(esFotoDeE24("http://photos.encuentra24.com/a.jpg")).toBe(false);
    expect(esFotoDeE24("https://photos.encuentra24.com.malo.example/a.jpg")).toBe(false);
    expect(esFotoDeE24("https://malencuentra24.com/a.jpg")).toBe(false);
    expect(esFotoDeE24("https://user:pw@photos.encuentra24.com/a.jpg")).toBe(false);
    expect(esFotoDeE24("https://photos.encuentra24.com:8443/a.jpg")).toBe(false);
    expect(esFotoDeE24("https://photos.encuentra24.com/logo.svg")).toBe(false);
    expect(esFotoDeE24("javascript:alert(1)")).toBe(false);
    expect(esFotoDeE24(42)).toBe(false);
  });

  it("el parser toma la principal y la galería (textos u objetos), sin repetir, hasta 4", () => {
    const o = anuncioE24(1, "Propietario", "Ana", {
      principalImage: FOTO(1),
      images: [FOTO(1), { url: FOTO(2) }, { src: FOTO(3) }, "https://tpc.googlesyndication.com/x.jpg", FOTO(4), FOTO(5)],
    });
    expect(fotosDeAnuncio(o)).toEqual([FOTO(1), FOTO(2), FOTO(3), FOTO(4)]);
    const [a] = anunciosDePagina(paginaE24([o]));
    expect(a.fotos).toEqual([FOTO(1), FOTO(2), FOTO(3), FOTO(4)]);
    // La foto de ejemplo de otro servidor no pasa.
    expect(anunciosDePagina(paginaE24([anuncioE24(2, "Propietario", "Ana")]))[0].fotos).toEqual([]);
  });

  it("se guardan junto a las razones y se leen de vuelta; lo raro se ignora", () => {
    const guardadas = senalesParaGuardar(
      [{ tipo: "pro", texto: "Se declara Propietario" }, "una sola propiedad", { tipo: "contra", texto: "  Tono   comercial " }, ""],
      [FOTO(1), "http://photos.encuentra24.com/x.jpg", FOTO(2)],
    );
    expect(guardadas).toEqual([
      { tipo: "pro", texto: "Se declara Propietario" },
      "una sola propiedad",
      { tipo: "contra", texto: "Tono comercial" },
      { tipo: "foto", url: FOTO(1) },
      { tipo: "foto", url: FOTO(2) },
    ]);
    const leidas = leerSenales([...guardadas, 7, null, { tipo: "foto", url: "https://evil.example/x.jpg" }, { tipo: "otro", texto: "x" }, ["a"]]);
    expect(leidas.razones).toEqual([
      { texto: "Se declara Propietario", lado: "pro" },
      { texto: "una sola propiedad", lado: null },
      { texto: "Tono comercial", lado: "contra" },
    ]);
    expect(leidas.fotos).toEqual([FOTO(1), FOTO(2)]);
  });

  it("los leads viejos (solo textos) siguen igual; la foto de la columna foto_url va primero", () => {
    expect(leerSenales(["texto en primera persona"])).toEqual({ razones: [{ texto: "texto en primera persona", lado: null }], fotos: [] });
    expect(leerSenales([{ tipo: "foto", url: FOTO(2) }], FOTO(1)).fotos).toEqual([FOTO(1), FOTO(2)]);
    expect(leerSenales("no es un arreglo", "https://otro.example/x.jpg")).toEqual({ razones: [], fotos: [] });
    expect(textosDeSenales(["a", { tipo: "foto", url: FOTO(1) }, { tipo: "contra", texto: "b" }])).toEqual(["a", "b"]);
  });

  it("la lista de WhatsApp lleva solo razones a favor, nunca fotos ni objetos", () => {
    const [a] = anunciosDePagina(paginaE24([anuncioE24(3, "Propietario", "Ana", { images: [FOTO(1)] })]));
    const lista = armarListaDuenos([{ anuncio: a, puntaje: 82, senales: [{ tipo: "contra", texto: "Tono comercial" }, { tipo: "pro", texto: "Se declara Propietario" }, "una sola propiedad"] }]);
    expect(lista).toContain("Se declara Propietario; una sola propiedad");
    expect(lista).not.toContain("Tono comercial");
    expect(lista).not.toContain("photos.encuentra24");
    expect(lista).not.toContain("[object Object]");
  });
});

describe("mensajes para el dueño", () => {
  const d = datosParaMensaje({ titulo: "Casa en Belén <b>", zona: "Heredia provincia, Belén, La Ribera", precio: "$350.000", nombre_anunciante: "Ana Mora" }, { nombre: "Deluxe Properties", nombre_contacto: "Patricia" });

  it("datos cortos y limpios; un nombre de empresa no se usa para saludar", () => {
    expect(d).toEqual({ titulo: "Casa en Belén b", zona: "Belén, La Ribera", precio: "$350.000", corredor: "Patricia", empresa: "Deluxe Properties", nombreDueno: "Ana" });
    expect(datosParaMensaje({ titulo: null, zona: null, precio: null, nombre_anunciante: "Inversiones del Valle" }, { nombre: "Patricia", nombre_contacto: "Patricia" })).toMatchObject({
      nombreDueno: null,
      empresa: null,
    });
  });

  it("los del código no traen cifras ni promesas", () => {
    for (const m of mensajesDeCodigo({ ...d, precio: null })) {
      expect(m.texto.replace(/Encuentra24/g, "")).not.toMatch(/\d/);
      expect(m.texto).not.toMatch(/garantiz|rápido|comisi/i);
    }
  });

  it("una cifra que no está en los datos se descarta; el precio y los números del título sí valen", () => {
    expect(traeCifraInventada("Vi su casa de $350.000 en Belén.", d)).toBe(false);
    expect(traeCifraInventada("La vendo en 30 días.", d)).toBe(true);
    const r = revisarMensajes({ whatsapp: "Hola, le escribo por su casa de $350.000. ¿Hablamos?", formulario: "Cobro 5 % de comisión y la vendo en 60 días.", seguimiento: 12 }, d);
    expect(r.cambiados).toBe(2);
    expect(r.mensajes[0].texto).toContain("$350.000");
    expect(r.mensajes[1].texto).not.toMatch(/5 %|60/);
    expect(r.mensajes.map((m) => m.canal)).toEqual(["whatsapp", "formulario", "seguimiento"]);
  });
});
