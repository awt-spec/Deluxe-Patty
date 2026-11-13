import { describe, expect, it } from "vitest";
import {
  NO_CAMBIA_CASA,
  NO_TAPA_DANOS,
  aplicarVideo,
  fotosParaChat,
  interpretarDemo,
  limpiarPedido,
  normalizarImagen,
  normalizarVideo,
  repartirDuracion,
  resumenVideo,
  vetoImagen,
  type EstadoVideo,
} from "@/lib/redes/chat";
import { cifrasInventadas, cifrasPermitidas, conCifrasDichas } from "@/lib/redes/cifras";
import type { OpcionFoto } from "@/lib/redes/fotos";
import { revisarTextoIA } from "@/lib/redes/texto-ia";
import { duracionTotal, guionPorDefecto } from "@/lib/redes/video";

// "Pídeselo a …" del estudio de redes: el modelo devuelve operaciones y el código las valida y aplica.

const op = (n: number, il = false): OpcionFoto => ({ url: `https://b/${n}.jpg`, ilustrativa: il, nombre: `Foto ${n}`, tipo: il ? "limpia" : "original", original: `https://b/${n}.jpg` });
const opciones = [op(1), op(2), op(3), op(4)];
const fotos = fotosParaChat(opciones);
const porDefecto = () => guionPorDefecto(opciones.map((o) => ({ url: o.url, ilustrativa: o.ilustrativa })), { titulo: "Casa con piscina" });
const nuevo = (): EstadoVideo => ({ escenas: porDefecto(), estilo: "elegante", formato: "vertical" });
const permitidas = cifrasPermitidas("4 habitaciones, 3 baños, 380 m², $1.250.000");

function aplicar(estado: EstadoVideo, crudas: unknown[]) {
  const n = normalizarVideo(crudas, estado, fotos, permitidas);
  return { n, ...aplicarVideo(estado, n.ops, { porDefecto }) };
}

describe("Video: operaciones", () => {
  it("el resumen nombra cada escena con su id corto y su foto", () => {
    const r = resumenVideo(nuevo(), fotos);
    expect(r).toContain("E1: Portada · foto F1");
    expect(r).toContain("E2: Foto · foto F2");
    expect(r).toMatch(/Estilo: Elegante/);
  });

  it("mover una foto a la posición 1 la pone de portada (y la anterior queda en su lugar)", () => {
    const e = nuevo();
    const { estado, hechos } = aplicar(e, [{ op: "mover_escena", escena: "E3", posicion: 1 }]);
    expect(estado.escenas[0]).toMatchObject({ tipo: "portada", foto: { url: "https://b/3.jpg" } });
    expect(estado.escenas[2].foto?.url).toBe("https://b/1.jpg");
    expect(hechos[0]).toContain("portada");
  });

  it("mover y quitar escenas; la portada y el cierre no se quitan", () => {
    const e = nuevo();
    const { estado, n } = aplicar(e, [
      { op: "mover_escena", escena: "E4", posicion: 2 },
      { op: "quitar_escena", escena: "E2" },
      { op: "quitar_escena", escena: "E1" },
      { op: "quitar_escena", escena: "E7" },
    ]);
    expect(n.ignoradas).toBe(2);
    expect(estado.escenas.map((x) => x.foto?.url ?? x.tipo)).toEqual(["https://b/1.jpg", "https://b/4.jpg", "https://b/3.jpg", "datos", "cierre"]);
  });

  it("ids que no existen se ignoran (escenas, fotos, estilos)", () => {
    const { n, estado } = aplicar(nuevo(), [
      { op: "quitar_escena", escena: "E40" },
      { op: "agregar_foto", foto: "F99" },
      { op: "estilo", valor: "psicodélico" },
      { op: "borrar_todo" },
    ]);
    expect(n.ops).toEqual([]);
    expect(n.ignoradas).toBe(4);
    expect(estado.escenas).toHaveLength(nuevo().escenas.length);
  });

  it("un texto con una cifra que no está en la ficha se descarta; uno bueno pasa recortado a 60", () => {
    const { n, estado } = aplicar(nuevo(), [
      { op: "texto_escena", escena: "E2", texto: "A 5 minutos de la playa" },
      { op: "texto_escena", escena: "E3", texto: "Cocina abierta llena de luz natural, ideal para recibir a toda la familia los fines de semana" },
    ]);
    expect(n.conCifras).toBe(1);
    expect(estado.escenas[1].texto).toBe("");
    expect(estado.escenas[2].texto.length).toBeLessThanOrEqual(60);
  });

  it("duración total: reparte de 2 a 6 s y, si no cabe, quita fotos del final y lo dice", () => {
    const e = nuevo(); // portada, 3 fotos, datos, cierre = 6 escenas
    const quince = aplicar(e, [{ op: "duracion_total", segundos: 15 }]);
    expect(duracionTotal(quince.estado.escenas)).toBe(15);
    quince.estado.escenas.forEach((x) => expect(x.duracion).toBeGreaterThanOrEqual(2));
    const diez = aplicar(e, [{ op: "duracion_total", segundos: 10 }]);
    expect(duracionTotal(diez.estado.escenas)).toBe(10);
    expect(diez.estado.escenas.filter((x) => x.tipo === "foto")).toHaveLength(2);
    expect(diez.hechos.join(" ")).toMatch(/quité la última foto/);
    const mucho = aplicar(e, [{ op: "duracion_total", segundos: 90 }]);
    expect(duracionTotal(mucho.estado.escenas)).toBe(36);
    expect(mucho.hechos.join(" ")).toMatch(/llega hasta 36 s/);
  });

  it("repartirDuracion respeta el máximo de 45 s", () => {
    const r = repartirDuracion(nuevo().escenas, 200);
    expect(duracionTotal(r.escenas)).toBeLessThanOrEqual(45);
  });

  it("estilo, formato, datos, agregar foto y restaurar", () => {
    const e = nuevo();
    const sinFoto4 = { ...e, escenas: e.escenas.filter((x) => x.foto?.url !== "https://b/4.jpg") };
    const { estado } = aplicar(sinFoto4, [
      { op: "estilo", valor: "Moderno" },
      { op: "formato", valor: "cuadrado" },
      { op: "quitar_datos" },
      { op: "agregar_foto", foto: "F4" },
    ]);
    expect(estado).toMatchObject({ estilo: "moderno", formato: "cuadrado" });
    expect(estado.escenas.some((x) => x.tipo === "datos")).toBe(false);
    expect(estado.escenas.at(-2)?.foto?.url).toBe("https://b/4.jpg");
    const de_nuevo = aplicar(estado, [{ op: "poner_datos" }, { op: "restaurar" }]);
    expect(de_nuevo.estado.escenas.map((x) => x.tipo)).toEqual(porDefecto().map((x) => x.tipo));
  });

  it("la demo entiende pedidos simples sin IA", () => {
    const d = interpretarDemo("video", "Hazlo de 15 segundos, estilo limpio y cuadrado", { escenas: nuevo().escenas });
    expect(d.operaciones.map((o) => o.op)).toEqual(["duracion_total", "estilo", "formato"]);
  });
});

describe("Imagen: reglas de las fotos con IA", () => {
  it.each(["agrega una piscina", "ponle vista al mar", "quita la pared", "cambia el piso", "hazla más grande", "quita el árbol del frente"])("«%s» cambiaría la casa", (p) => {
    expect(vetoImagen(p)).toBe(NO_CAMBIA_CASA);
  });
  it.each(["tapa la humedad", "quita las grietas de la pared", "arregla la mancha del techo"])("«%s» taparía un daño", (p) => {
    expect(vetoImagen(p)).toBe(NO_TAPA_DANOS);
  });
  it.each(["quita el carro", "quita los basureros de la cochera", "amuebla la sala estilo moderno", "ponle muebles al cuarto", "usa la de la piscina", "mejora esta foto"])("«%s» se puede", (p) => {
    expect(vetoImagen(p)).toBeNull();
  });

  it("una edición sale de la original, una por pedido, y el código niega aunque el modelo la diera por buena", () => {
    const conIlustrativa = fotosParaChat([op(1), op(2), { ...op(9, true), original: "https://b/2.jpg" }]);
    const n = normalizarImagen(
      [
        { op: "elegir_foto", foto: "F2" },
        { op: "quitar_objetos", foto: "F3", texto: "el carro" },
        { op: "amueblar", foto: "F1", valor: "tropical" },
      ],
      conIlustrativa,
      null,
      "usa la 2 y quita el carro",
    );
    expect(n.ops).toEqual([
      { op: "elegir_foto", url: "https://b/2.jpg", nombre: "Foto 2" },
      { op: "quitar_objetos", url: "https://b/2.jpg", nombre: "Foto 2", que: "el carro" },
    ]);
    expect(n.ignoradas).toBe(1);
    const negada = normalizarImagen([{ op: "quitar_objetos", foto: "F1", texto: "la piscina" }], conIlustrativa, null, "límpiala");
    expect(negada.ops).toEqual([]);
    expect(negada.negada).toBe(NO_CAMBIA_CASA);
  });
});

describe("Texto: cifras dichas por el corredor", () => {
  const casa = { codigo: "DP-07", precio: 1250000, moneda: "USD" as const, operacion: "venta" as const };
  const contacto = { nombre: "Patricia", whatsapp: "+50688887777" };
  const ficha = "Casa DP-07, 4 habitaciones, $1.250.000";
  const anterior = "Casa en Escazú\n$1.250.000\nwa.me/50688887777 (código DP-07)";

  it("conCifrasDichas suma solo las cifras del pedido", () => {
    const s = conCifrasDichas(cifrasPermitidas(ficha), "agrégale que tiene 2 parqueos");
    expect(cifrasInventadas("2 parqueos y 4 habitaciones", s)).toEqual([]);
    expect(cifrasInventadas("3 parqueos", s)).toEqual(["3"]);
  });

  it("un dato nuevo con la cifra que dijo el corredor pasa; una cifra inventada por el modelo no", () => {
    const bueno = revisarTextoIA(`${anterior}\nTiene 2 parqueos y acepta mascotas.`, { ficha, anterior, casa, contacto, modo: "mejorar", dichoPorCorredor: "agrégale que tiene 2 parqueos y acepta mascotas" });
    expect(bueno.ok).toBe(true);
    const malo = revisarTextoIA(`${anterior}\nTiene 2 parqueos, a 5 minutos del mall.`, { ficha, anterior, casa, contacto, modo: "mejorar", dichoPorCorredor: "agrégale que tiene 2 parqueos" });
    expect(malo.ok).toBe(false);
  });

  it("el pedido se recorta a 500 caracteres", () => {
    expect(limpiarPedido("x".repeat(900))).toHaveLength(500);
  });
});
