// Extensión 1.6.0, "Llenar con Patty": las reglas puras que reconocen los campos del formulario de publicar de
// Encuentra24 (extension/campos.js, cargado con node:vm como se inyecta en la pestaña), las del panel lateral
// (extension/llenado.js), los pedidos nuevos entre el panel lateral y el trabajador de fondo (extension/mensajes.js) y lo
// que nunca hace: tocar botones, enviar el formulario o usar chrome.storage desde la página.
import { readdirSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import manifiesto from "../extension/manifest.json";
import { ARCHIVOS_EXTENSION, revisarCarpeta } from "../scripts/empacar-extension.mjs";

type Descriptor = { tipo: string; etiqueta?: string; aria?: string; placeholder?: string; nombre?: string; opciones?: string[]; vacio?: boolean; bloqueado?: boolean };
type Accion = { clave: string; indice: number; valor?: string; opcion?: number };
interface Campos {
  normalizar(t: string): string;
  elegirOpcion(clave: string, valor: unknown, opciones: string[]): number;
  planear(d: Descriptor[], datos: unknown, solo?: string[] | null): { acciones: Accion[]; faltan: string[]; sinOpcion: string[]; yaTenian: string[] };
  marcarAmenidades(etiquetas: string[], amenidades: string[]): number[];
  esExcluido(d: Descriptor): boolean;
}
const leer = (archivo: string) => readFileSync(`extension/${archivo}`, "utf8");
const sandbox: { self: { CamposPatty?: Campos } } = { self: {} };
runInNewContext(leer("campos.js"), sandbox);
const C = sandbox.self.CamposPatty!;

const cargar = async <T,>(ruta: string) => (await import(/* @vite-ignore */ ruta)) as T;
interface Llenado {
  esFormularioDePublicar(url: string): boolean;
  esFotoParaLlenar(url: string): boolean;
  limpiarDatosLlenar(a: unknown): Record<string, unknown> | null;
  limpiarListos(l: unknown): { id: string; portada: string | null }[];
  limpiarCasas(l: unknown): { id: string; portada: string | null }[];
  textoInforme(i: unknown, asistente?: string): string;
  textoAvance(l: unknown): string;
  vistaPublicar(d: Record<string, unknown>): Record<string, unknown>;
  INICIO_E24: string;
}
interface Mensajes {
  leerPedido(de: string | null, m: unknown): Record<string, unknown> | null;
}
const ll = await cargar<Llenado>("../extension/llenado.js");
const men = await cargar<Mensajes>("../extension/mensajes.js");

const ANUNCIO = "aaaaaaaa-1111-4111-8111-111111111111";
const FOTO = "https://abc.supabase.co/storage/v1/object/public/fotos/00000000-0000-4000-8000-000000000001/casa/originales/1.jpg";

const DATOS = {
  es: { titulo: "Casa en Escazú con vista", descripcion: "Linda casa.\n\nEscríbeme por WhatsApp: https://wa.me/50688887777?text=ref" },
  operacion: "venta",
  tipo: "casa",
  precio: 350000,
  moneda: "USD",
  provincia: "San José",
  canton: "Escazú",
  distrito: "San Rafael",
  zona: "Trejos Montealegre",
  habitaciones: 3,
  banos: 2.5,
  m2_construccion: 280,
  m2_terreno: 450,
  amenidades: ["Piscina", "Jardín"],
};

describe("campos.js: reconoce los campos por lo que dicen", () => {
  it("normaliza tildes, mayúsculas, m² y camelCase", () => {
    expect(C.normalizar("Baños")).toBe("banos");
    expect(C.normalizar("ÁREA DE CONSTRUCCIÓN (m²)")).toBe("area de construccion m2");
    expect(C.normalizar("propertyTitle")).toBe("property title");
    expect(C.normalizar("Cantón:")).toBe("canton");
  });

  it("llena un formulario típico con y sin tildes y con sinónimos", () => {
    const form: Descriptor[] = [
      { tipo: "texto", etiqueta: "Título del anuncio", vacio: true },
      { tipo: "area", etiqueta: "Descripcion", vacio: true },
      { tipo: "numero", etiqueta: "Precio", vacio: true },
      { tipo: "select", etiqueta: "Moneda", opciones: ["Selecciona", "US$ Dólares", "₡ Colones"], vacio: true },
      { tipo: "numero", placeholder: "Dormitorios", vacio: true },
      { tipo: "select", aria: "Baños", opciones: ["--", "1", "2", "2.5", "3", "4+"], vacio: true },
      { tipo: "numero", etiqueta: "Metros de construcción", vacio: true },
      { tipo: "numero", etiqueta: "Tamaño del lote (m²)", vacio: true },
      { tipo: "select", etiqueta: "Provincia", opciones: ["Elige una", "Alajuela", "San Jose", "Heredia"], vacio: true },
      { tipo: "select", etiqueta: "Canton", opciones: ["Seleccione", "Santa Ana", "Escazu"], vacio: true },
      { tipo: "select", etiqueta: "Tipo de propiedad", opciones: ["Seleccione", "Apartamentos", "Casas", "Lotes"], vacio: true },
      { tipo: "radio", etiqueta: "", opciones: ["Venta", "Alquiler"], vacio: true },
    ];
    const plan = C.planear(form, DATOS);
    const por = Object.fromEntries(plan.acciones.map((a) => [a.clave, a]));
    expect(por.titulo).toMatchObject({ indice: 0, valor: "Casa en Escazú con vista" });
    expect(por.descripcion).toMatchObject({ indice: 1 });
    expect(String(por.descripcion.valor)).toMatch(/wa\.me/);
    expect(por.precio).toMatchObject({ indice: 2, valor: "350000" });
    expect(por.moneda).toMatchObject({ indice: 3, opcion: 1 });
    expect(por.habitaciones).toMatchObject({ indice: 4, valor: "3" });
    expect(por.banos).toMatchObject({ indice: 5, opcion: 3 });
    expect(por.m2_construccion).toMatchObject({ indice: 6, valor: "280" });
    expect(por.m2_terreno).toMatchObject({ indice: 7, valor: "450" });
    expect(por.provincia).toMatchObject({ indice: 8, opcion: 2 });
    expect(por.canton).toMatchObject({ indice: 9, opcion: 2 });
    expect(por.tipo).toMatchObject({ indice: 10, opcion: 2 });
    // Sin etiqueta, la lista Venta / Alquiler se reconoce por sus opciones.
    expect(por.operacion).toMatchObject({ indice: 11, opcion: 0 });
    // Lo que no está en el formulario queda para la persona.
    expect(plan.faltan.sort()).toEqual(["distrito", "zona"]);
  });

  it("nunca elige botones, archivos, búsqueda, correo, teléfono ni campos bloqueados", () => {
    const form: Descriptor[] = [
      { tipo: "submit", etiqueta: "Publicar precio" },
      { tipo: "button", aria: "Título" },
      { tipo: "file", etiqueta: "Descripción" },
      { tipo: "texto", placeholder: "Buscar por título o precio", vacio: true },
      { tipo: "email", etiqueta: "Título" },
      { tipo: "texto", etiqueta: "Teléfono", vacio: true },
      { tipo: "texto", etiqueta: "Título", vacio: true, bloqueado: true },
    ];
    const plan = C.planear(form, DATOS);
    expect(plan.acciones).toEqual([]);
    expect(plan.faltan).toContain("titulo");
    for (const d of form) expect(C.esExcluido(d)).toBe(true);
  });

  it("el precio no cae en 'precio por m²' ni en la moneda; m² de terreno no cae en construcción", () => {
    const form: Descriptor[] = [
      { tipo: "numero", etiqueta: "Precio por m2", vacio: true },
      { tipo: "numero", etiqueta: "Área del terreno", vacio: true },
      { tipo: "numero", etiqueta: "Precio de venta", vacio: true },
      { tipo: "numero", etiqueta: "Área construida", vacio: true },
    ];
    const por = Object.fromEntries(C.planear(form, DATOS).acciones.map((a) => [a.clave, a.indice]));
    expect(por).toMatchObject({ precio: 2, m2_terreno: 1, m2_construccion: 3 });
    expect(Object.values(por)).not.toContain(0);
  });

  it("no pisa lo que la persona ya escribió", () => {
    const plan = C.planear([{ tipo: "texto", etiqueta: "Título", vacio: false }, { tipo: "area", etiqueta: "Descripción", vacio: true }], DATOS, ["titulo", "descripcion"]);
    expect(plan.yaTenian).toEqual(["titulo"]);
    expect(plan.acciones.map((a) => a.clave)).toEqual(["descripcion"]);
  });

  it("una lista sin la opción queda sin tocar (y se avisa)", () => {
    const plan = C.planear([{ tipo: "select", etiqueta: "Provincia", opciones: ["Seleccione", "Panamá", "Chiriquí"], vacio: true }], DATOS, ["provincia"]);
    expect(plan.acciones).toEqual([]);
    expect(plan.sinOpcion).toEqual(["provincia"]);
  });

  it("elige opciones por su texto: números con 'o más', moneda por símbolo, alquiler por sinónimo", () => {
    expect(C.elegirOpcion("habitaciones", 6, ["Seleccione", "1", "2", "3", "4", "5 o más"])).toBe(5);
    expect(C.elegirOpcion("habitaciones", 2, ["Seleccione", "1", "2", "3+"])).toBe(2);
    expect(C.elegirOpcion("moneda", "CRC", ["Moneda", "$", "₡"])).toBe(2);
    expect(C.elegirOpcion("moneda", "USD", ["Moneda", "Colones", "Dólares"])).toBe(2);
    expect(C.elegirOpcion("operacion", "alquiler", ["Seleccione", "En venta", "Renta"])).toBe(2);
    expect(C.elegirOpcion("tipo", "apartamento", ["Casas", "Condominios", "Departamentos"])).toBe(2);
    expect(C.elegirOpcion("tipo", "otro", ["Casas", "Lotes"])).toBe(-1);
  });

  it("marca solo las casillas de las amenidades de la casa, nunca términos ni avisos", () => {
    expect(C.marcarAmenidades(["Piscina", "Gimnasio", "Jardin", "Acepto los términos y condiciones", "Recibir ofertas por correo"], ["piscina", "jardín"])).toEqual([0, 2]);
  });
});

describe("llenado.js: el panel lateral", () => {
  it("reconoce el formulario de publicar por la dirección (solo Encuentra24, nunca un anuncio)", () => {
    expect(ll.esFormularioDePublicar("https://www.encuentra24.com/costa-rica-es/publicar")).toBe(true);
    expect(ll.esFormularioDePublicar("https://www.encuentra24.com/costa-rica-es/post-ad/bienes-raices")).toBe(true);
    expect(ll.esFormularioDePublicar("https://www.encuentra24.com/costa-rica-es/bienes-raices-venta-de-propiedades-casas")).toBe(false);
    expect(ll.esFormularioDePublicar("https://www.encuentra24.com/costa-rica-es/casas/casa-en-escazu/31234567")).toBe(false);
    expect(ll.esFormularioDePublicar("https://otro.example/publicar")).toBe(false);
    expect(ll.INICIO_E24.startsWith("https://www.encuentra24.com/")).toBe(true);
  });

  it("solo baja fotos del bucket público 'fotos' por https", () => {
    expect(ll.esFotoParaLlenar(FOTO)).toBe(true);
    for (const u of [
      FOTO.replace("https:", "http:"),
      "https://abc.supabase.co/storage/v1/object/public/fichas/x.pdf",
      "https://img.encuentra24.com/foto.jpg",
      "https://abc.supabase.co/storage/v1/object/public/fotos/../secreto",
      "https://user:clave@abc.supabase.co/storage/v1/object/public/fotos/a.jpg",
      "nada",
    ]) {
      expect(ll.esFotoParaLlenar(u), u).toBe(false);
    }
  });

  it("limpia lo que llega del servidor: ids, textos, números y fotos ajenas fuera", () => {
    const d = ll.limpiarDatosLlenar({ id: ANUNCIO, referencia: "A1B2C3", es: DATOS.es, precio: -3, moneda: "EUR", fotos: [FOTO, "https://malo.example/x.jpg", FOTO], amenidades: ["Piscina", 3] });
    expect(d).toMatchObject({ id: ANUNCIO, precio: null, moneda: null, fotos: [FOTO], amenidades: ["Piscina"] });
    expect(ll.limpiarDatosLlenar({ id: "no-uuid", es: DATOS.es })).toBeNull();
    expect(ll.limpiarDatosLlenar({ id: ANUNCIO, es: { titulo: "", descripcion: "x" } })).toBeNull();
    expect(ll.limpiarListos([{ id: ANUNCIO, titulo: "T", portada: "https://malo.example/a.jpg" }, { id: "x" }])).toEqual([
      { id: ANUNCIO, referencia: "", titulo: "T", casa: "", codigo: "", portada: null },
    ]);
    expect(ll.limpiarCasas([{ id: ANUNCIO, titulo: "Casa", portada: FOTO, conBorrador: true }])[0]).toMatchObject({ portada: FOTO, conBorrador: true });
  });

  it("el informe dice qué llenó, qué falta, las fotos y que publica la persona", () => {
    const t = ll.textoInforme(
      { llenados: ["titulo", "descripcion", "precio"], faltan: ["provincia"], yaTenian: [], amenidades: 0, fotos: { total: 8, adjuntadas: 8 }, conEnlace: true },
      "Ana",
    );
    expect(t).toBe(
      "Llené: título, descripción y precio. Llénalos tú: provincia. 8 fotos adjuntas. Revisa todo y toca Publicar en Encuentra24. Ya publicado, abre tu anuncio y toca «Leer este anuncio»: Ana lo enlaza a tu panel.",
    );
    expect(ll.textoInforme({ llenados: [], fotos: { total: 3, sinCampo: true } })).toMatch(/No encontré campos.*No encontré dónde subir las fotos: súbelas tú \(3/);
    expect(ll.textoInforme({ llenados: ["titulo"], detenido: true, fotos: { total: 5, adjuntadas: 0 } })).toMatch(/^Lo detuviste.*No adjunté fotos/);
    expect(ll.textoInforme({ llenados: ["titulo"], conEnlace: false })).toMatch(/no lleva tu enlace de WhatsApp/);
  });

  it("avance y tarjeta: 'Llenando… 3 de 8 fotos' con Detener; fuera del formulario, abrir Encuentra24", () => {
    expect(ll.textoAvance({ paso: "fotos", hechas: 3, total: 8 })).toBe("Llenando… 3 de 8 fotos");
    expect(ll.textoAvance({ paso: "campos" })).toBe("Llenando los campos…");
    const url = "https://www.encuentra24.com/costa-rica-es/publicar";
    const ahora = 1_000_000;
    const v = ll.vistaPublicar({ url, llenado: { fase: "llenando", paso: "fotos", hechas: 3, total: 8, url, fecha: ahora - 1000 }, ahora, asistente: "Ana" });
    expect(v).toMatchObject({ titulo: "Publicar con Ana", enFormulario: true, llenando: true, avance: "Llenando… 3 de 8 fotos" });
    // Colgado hace mucho: ya no se muestra "llenando".
    expect(ll.vistaPublicar({ url, llenado: { fase: "llenando", url, fecha: 0 }, ahora: 10 * 60_000 }).llenando).toBe(false);
    // El informe es de esa misma página.
    expect(ll.vistaPublicar({ url, llenado: { fase: "listo", mensaje: "Llené: título.", url: "https://www.encuentra24.com/otra" } }).informe).toBe("");
    expect(ll.vistaPublicar({ url: "https://www.google.com" })).toMatchObject({ enFormulario: false, ayuda: expect.stringMatching(/Abre Encuentra24/) });
    // Una página de Encuentra24 que dijo tener formulario, aunque la dirección no lo diga.
    expect(ll.vistaPublicar({ url: "https://www.encuentra24.com/costa-rica-es/mi-cuenta/nuevo", formulario: true }).enFormulario).toBe(true);
  });
});

describe("mensajes nuevos: solo el panel lateral, con su forma", () => {
  it("llenar, ver formulario, preparar, listas y detener", () => {
    expect(men.leerPedido("popup", { tipo: "llenar_formulario", tabId: 4, anuncio: ANUNCIO })).toEqual({ tipo: "llenar_formulario", tabId: 4, anuncio: ANUNCIO });
    expect(men.leerPedido("popup", { tipo: "llenar_formulario", tabId: "4", anuncio: ANUNCIO })).toBeNull();
    expect(men.leerPedido("popup", { tipo: "llenar_formulario", tabId: 4, anuncio: "x'; drop" })).toBeNull();
    expect(men.leerPedido("popup", { tipo: "ver_formulario", tabId: 2 })).toEqual({ tipo: "ver_formulario", tabId: 2 });
    expect(men.leerPedido("popup", { tipo: "preparar_anuncio", casaId: ANUNCIO, extra: 1 })).toEqual({ tipo: "preparar_anuncio", casaId: ANUNCIO });
    expect(men.leerPedido("popup", { tipo: "preparar_anuncio", casaId: 3 })).toBeNull();
    for (const tipo of ["anuncios_listos", "casas_para_anuncio", "detener_llenado"]) {
      expect(men.leerPedido("popup", { tipo, cualquier: "cosa" })).toEqual({ tipo });
    }
  });

  it("la página del panel y la barra sobre Encuentra24 no los pueden pedir", () => {
    for (const de of ["panel", "control", null]) {
      for (const m of [{ tipo: "llenar_formulario", tabId: 1, anuncio: ANUNCIO }, { tipo: "detener_llenado" }, { tipo: "preparar_anuncio", casaId: ANUNCIO }]) {
        expect(men.leerPedido(de, m)).toBeNull();
      }
    }
  });
});

describe("lo que el llenado nunca hace", () => {
  const llenar = leer("llenar.js");
  const campos = leer("campos.js");
  const fondo = leer("background.js");

  it("no toca botones, no envía el formulario, no usa chrome.* ni la red desde la página", () => {
    for (const [nombre, c] of [["llenar.js", llenar], ["campos.js", campos]]) {
      expect(c, nombre).not.toMatch(/\.click\(|\.submit\(|requestSubmit|new (Mouse|Pointer|Keyboard|Submit)Event|chrome\.|fetch\(|XMLHttpRequest|eval\(|new Function|innerHTML/);
    }
    // Solo escucha nada: no se le puede hablar desde la página.
    expect(llenar).not.toMatch(/addEventListener\(\s*["']message/);
  });

  it("se inyecta desde el trabajador de fondo solo en el marco principal de la pestaña elegida, que tiene que ser de Encuentra24", () => {
    expect(fondo).toContain('files: ["campos.js", "llenar.js"]');
    expect(fondo).toMatch(/if \(!esUrlDeE24\(tabUrl\)\)/);
    expect(fondo).toMatch(/target: \{ tabId, frameIds: \[0\] \}/);
    // Detener corta lo que falta.
    expect(fondo).toContain("LL?.control.abort()");
    expect(fondo).toMatch(/bajarFoto\(fotos\[i\], i, control\.signal\)/);
  });

  it("paquete 1.6.0: los archivos nuevos van en el zip y no hay permisos nuevos", () => {
    for (const n of ["campos.js", "llenar.js", "llenado.js"]) expect(ARCHIVOS_EXTENSION).toContain(n);
    expect(revisarCarpeta(readdirSync("extension"))).toEqual({ sobran: [], faltan: [] });
    expect(manifiesto.version).toBe("1.6.0");
    expect(manifiesto.permissions.sort()).toEqual(["alarms", "scripting", "sidePanel", "storage"]);
    expect(manifiesto.host_permissions).toEqual(["https://www.encuentra24.com/*", "__APP__/*"]);
    expect(manifiesto.description.length).toBeLessThanOrEqual(132);
    expect("web_accessible_resources" in manifiesto).toBe(false);
  });
});
