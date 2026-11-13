import "server-only";
import { Document, Image, Page, Text, View, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { anchosColumnas, cifrasClave, columnasNumericas, contarPaginas } from "../fichas/diseno";
import { registrarFuentes } from "../fichas/ficha";
import { marcaNeutra, type Marca } from "../fichas/marca";
import {
  EncabezadoDelgado,
  FilaCifras,
  MARGEN_PAGINA as M,
  mezclar,
  PieDePagina,
  Rombo,
  TarjetaCifra,
  tipografiaDe,
} from "../fichas/piezas-pdf";
import { rutaDeMarca } from "../marcas/archivo";
import { bloques, trozos, type Bloque } from "./markdown";

// Documento PDF con lo que preparó Patty (un informe, una comparación, un resumen para un cliente), con la marca
// del corredor: portada ligera (o completa si pasa de 2 páginas), resumen destacado, cifras clave en tarjetas,
// tablas con anchos según su contenido y diagramas (que llegan ya dibujados como PNG desde el navegador, en orden).
// Nada se calcula: el texto es el de Patty, solo cambia cómo se ve.

export interface DatosPdfPatty {
  titulo: string;
  texto: string;
  /** Diagramas como data:image/png;base64, en el orden en que aparecen. */
  diagramas: string[];
  marca: Marca | null;
  corredor: string;
  fecha: string;
  /** Logo ya resuelto (archivo local de marcas/ o https), o null. */
  logo?: string | null;
  /** Nombre de la asistente para "Preparado por …" (por defecto, Patty). */
  asistente?: string;
}

const sinMarcas = (s: string) => s.replace(/\*\*|`/g, "");

function Linea({ texto, color }: { texto: string; color: string }) {
  return (
    <>
      {trozos(texto).map((t, i) => {
        if (t.tipo === "negrita") return <Text key={i} style={{ fontWeight: 600, color }}>{t.texto}</Text>;
        if (t.tipo === "codigo") return <Text key={i} style={{ fontFamily: "Courier", fontSize: 9 }}>{t.texto}</Text>;
        if (t.tipo === "imagen") return null;
        // Los enlaces del panel (/panel/…) no sirven fuera de la app: van como texto.
        return <Text key={i}>{t.texto}</Text>;
      })}
    </>
  );
}

function DocumentoPatty({ titulo, texto, diagramas, marca: marcaDato, corredor, fecha, logo, asistente = "Patty", portadaCompleta }: DatosPdfPatty & { portadaCompleta: boolean }) {
  const marca = marcaDato ?? marcaNeutra(corredor);
  const c = marca.colores;
  const t = tipografiaDe(marca);
  const serif = { fontFamily: t.titulo, fontWeight: t.pesoTitulo };
  const suave = mezclar(c.base, c.soporte, marcaDato ? 0.12 : 0.07);
  const linea = mezclar(c.soporte, "#ffffff", 0.6);
  const tinta = "#1f2a30";
  const blanco = "#ffffff";
  const etiqueta = { fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase" as const, fontWeight: 500 };
  const fondoLogo = marca.fondoLogo ?? c.profundo;
  const preparado = `Preparado por ${asistente} para ${corredor}`;
  const firma = marca.firma ? `${marca.firma.nombre} · ${marca.firma.cargo}` : marca.nombre;

  // El título ya va arriba: si el texto empieza con el mismo título (# …), no se repite.
  const todos = bloques(texto);
  const lista = todos[0]?.tipo === "titulo" && todos[0].nivel === 1 ? todos.slice(1) : todos;
  const clave = cifrasClave(lista);
  let diagrama = 0;

  const Logo = ({ tam }: { tam: number }) =>
    logo ? (
      <View style={{ width: tam, height: tam, backgroundColor: fondoLogo, borderRadius: 3 }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no lleva alt */}
        <Image src={logo} style={{ width: tam, height: tam, objectFit: "contain" }} />
      </View>
    ) : null;

  const Tabla = ({ b }: { b: Extract<Bloque, { tipo: "tabla" }> }) => {
    const anchos = anchosColumnas(b.cabecera, b.filas);
    const numericas = columnasNumericas(b.filas, b.cabecera.length);
    const chica = b.cabecera.length > 5 ? 8 : 9;
    const celda = (j: number) => ({ width: `${anchos[j]}%`, lineHeight: 1.3, paddingVertical: 6, paddingHorizontal: 7, textAlign: (numericas[j] ? "right" : "left") as "right" | "left" });
    return (
      // Una tabla corta no se parte; una larga se parte entre filas y repite su cabecera.
      <View wrap={b.filas.length > 8} style={{ marginTop: 6, marginBottom: 12, borderRadius: 4, borderWidth: 0.75, borderColor: linea }}>
        {/* La cabecera se repite si la tabla sigue en la página siguiente. */}
        <View fixed style={{ flexDirection: "row", backgroundColor: c.profundo }} minPresenceAhead={30}>
          {b.cabecera.map((h, j) => (
            <Text key={j} style={{ ...celda(j), color: blanco, fontWeight: 600, fontSize: chica - 0.5, letterSpacing: 0.3 }}>
              {sinMarcas(h)}
            </Text>
          ))}
        </View>
        {b.filas.map((f, j) => (
          <View key={j} wrap={false} style={{ flexDirection: "row", backgroundColor: j % 2 ? suave : blanco, borderTopWidth: j === 0 ? 0 : 0.5, borderTopColor: linea }}>
            {f.map((valor, k) => (
              <Text key={k} style={{ ...celda(k), fontSize: chica, color: tinta, fontWeight: k === 0 ? 500 : 400 }}>
                <Linea texto={valor} color={c.profundo} />
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  };

  // Un título no se queda solo al pie de una página: va junto con lo que lo sigue si es corto (un párrafo, una
  // lista, una cita, un diagrama o una tabla de hasta 8 filas), y con un párrafo y una pieza corta después.
  const corto = (b: Bloque | undefined) =>
    !!b &&
    ((b.tipo === "codigo" && b.lenguaje === "mermaid") ||
      b.tipo === "cita" ||
      (b.tipo === "lista" && b.items.length <= 4) ||
      (b.tipo === "tabla" && b.filas.length <= 8) ||
      (b.tipo === "parrafo" && b.texto.length < 500));
  const cuantosJuntos = (i: number) => {
    if (lista[i]?.tipo !== "titulo") return 1;
    const tocaCifras = (j: number) => clave !== null && clave.indice === j;
    if (!corto(lista[i + 1]) || tocaCifras(i + 1)) return 1;
    if (lista[i + 1].tipo === "parrafo" && corto(lista[i + 2]) && lista[i + 2].tipo !== "parrafo" && !tocaCifras(i + 2)) return 3;
    return 2;
  };

  const elementos: ReactElement[] = [];
  for (let i = 0; i < lista.length; i++) {
    const n = cuantosJuntos(i);
    const grupo = Array.from({ length: n }, (_, k) => bloque(lista[i + k], i + k)).filter((e): e is ReactElement => e !== null);
    if (n > 1)
      elementos.push(
        <View key={`g${i}`} wrap={false}>
          {grupo}
        </View>,
      );
    else if (grupo[0]) elementos.push(grupo[0]);
    i += n - 1;
  }

  function bloque(b: Bloque, i: number): ReactElement | null {
    if (clave && i === clave.indice) {
      return (
        <View key={i} style={{ marginTop: 4, marginBottom: 16 }}>
          <FilaCifras>
            {clave.cifras.map((cf) => (
              <TarjetaCifra key={cf.etiqueta} valor={cf.valor} etiqueta={cf.etiqueta} colores={c} marca={marca} fondo={blanco} />
            ))}
          </FilaCifras>
        </View>
      );
    }
    switch (b.tipo) {
      case "titulo":
        if (b.nivel === 3)
          return (
            <Text key={i} minPresenceAhead={48} style={{ fontSize: 10.5, fontWeight: 600, color: c.profundo, marginTop: 10, marginBottom: 5 }}>
              {sinMarcas(b.texto)}
            </Text>
          );
        return (
          <View key={i} minPresenceAhead={90} style={{ marginTop: i === 0 ? 0 : 16, marginBottom: 8 }}>
            <Text style={{ ...serif, fontSize: b.nivel === 1 ? 18 : 15, color: c.profundo, lineHeight: 1.25 }}>{sinMarcas(b.texto)}</Text>
            <View style={{ width: 32, height: 1.2, backgroundColor: c.principal, marginTop: 5 }} />
          </View>
        );
      case "parrafo":
        // El primer párrafo (la conclusión) va como resumen destacado.
        if (i === 0)
          return (
            <View key={i} wrap={false} style={{ backgroundColor: suave, borderLeftWidth: 3, borderLeftColor: c.principal, borderRadius: 3, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14 }}>
              <Text style={{ ...etiqueta, color: c.soporte, marginBottom: 5 }}>En resumen</Text>
              <Text style={{ fontSize: 11.5, lineHeight: 1.5, color: c.profundo }}>
                <Linea texto={b.texto} color={c.profundo} />
              </Text>
            </View>
          );
        return (
          <Text key={i} orphans={3} widows={3} style={{ marginBottom: 8 }}>
            <Linea texto={b.texto} color={c.profundo} />
          </Text>
        );
      case "lista":
        return (
          <View key={i} style={{ marginBottom: 9, marginTop: 1 }}>
            {b.items.map((it, j) => (
              <View key={j} wrap={false} style={{ flexDirection: "row", marginBottom: 4, paddingRight: 8 }}>
                {b.ordenada ? (
                  <Text style={{ width: 16, color: c.principal, fontWeight: 600, fontSize: 9.5 }}>{j + 1}.</Text>
                ) : (
                  <View style={{ width: 14 }}>
                    <Rombo color={c.principal} arriba={5} />
                  </View>
                )}
                <Text style={{ flex: 1 }}>
                  <Linea texto={it} color={c.profundo} />
                </Text>
              </View>
            ))}
          </View>
        );
      case "tabla":
        return <Tabla key={i} b={b} />;
      case "cita":
        return (
          <View key={i} wrap={false} style={{ flexDirection: "row", marginVertical: 8 }}>
            <View style={{ width: 3, backgroundColor: c.principal, borderRadius: 1 }} />
            <View style={{ flex: 1, backgroundColor: suave, paddingVertical: 10, paddingHorizontal: 14, borderTopRightRadius: 3, borderBottomRightRadius: 3 }}>
              <Text style={{ fontFamily: t.serif ? "Playfair" : "Inter", fontStyle: t.serif ? "italic" : "normal", fontSize: t.serif ? 11.5 : 10.5, lineHeight: 1.5, color: c.profundo }}>
                <Linea texto={b.texto} color={c.profundo} />
              </Text>
            </View>
          </View>
        );
      case "codigo": {
        if (b.lenguaje === "mermaid") {
          const png = diagramas[diagrama];
          if (!png) return null;
          diagrama++;
          return (
            <View key={i} wrap={false} style={{ marginVertical: 12, alignItems: "center" }}>
              <View style={{ borderWidth: 0.75, borderColor: linea, borderRadius: 4, padding: 12, backgroundColor: blanco, alignItems: "center", width: "100%" }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no lleva alt */}
                <Image src={png} style={{ maxWidth: 480, maxHeight: 400, objectFit: "contain" }} />
              </View>
              <Text style={{ fontSize: 7.5, color: c.soporte, marginTop: 5 }}>Diagrama {diagrama}</Text>
            </View>
          );
        }
        return (
          <View key={i} style={{ backgroundColor: suave, borderRadius: 3, paddingVertical: 8, paddingHorizontal: 10, marginVertical: 6 }}>
            <Text style={{ fontFamily: "Courier", fontSize: 8.5, lineHeight: 1.45, color: tinta }}>{b.texto}</Text>
          </View>
        );
      }
    }
    return null;
  }

  const paginaContenido = { fontFamily: "Inter", fontSize: 10.2, color: tinta, lineHeight: 1.5, paddingTop: 66, paddingBottom: 56, paddingHorizontal: M, backgroundColor: blanco };

  return (
    <Document title={titulo} author={marca.nombre} creator={marca.nombre} language="es">
      {portadaCompleta && (
        <Page size="A4" style={{ backgroundColor: c.profundo, fontFamily: "Inter", color: c.base, paddingHorizontal: 56, paddingTop: 64, paddingBottom: 56 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            {logo ? <Logo tam={84} /> : <Text style={{ ...serif, fontSize: 16, color: blanco }}>{marca.nombre}</Text>}
            <Text style={{ ...etiqueta, color: mezclar(c.base, c.profundo, 0.35) }}>{fecha}</Text>
          </View>
          <View style={{ position: "absolute", left: 56, right: 56, top: 330 }}>
            <Text style={{ ...etiqueta, color: c.principal }}>Informe</Text>
            <Text style={{ ...serif, fontSize: titulo.length > 70 ? 26 : 34, lineHeight: 1.18, color: blanco, marginTop: 12 }} maxLines={5}>
              {titulo}
            </Text>
            <View style={{ width: 64, height: 1.2, backgroundColor: c.principal, marginTop: 22, marginBottom: 18 }} />
            <Text style={{ fontSize: 11, color: mezclar(c.base, c.profundo, 0.2) }}>{preparado}</Text>
            <Text style={{ fontSize: 9.5, color: mezclar(c.base, c.profundo, 0.4), marginTop: 4 }}>{fecha}</Text>
          </View>
          <View style={{ position: "absolute", left: 56, right: 56, bottom: 52, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 0.6, borderTopColor: mezclar(c.soporte, c.profundo, 0.4), paddingTop: 10 }}>
            <Text style={{ fontSize: 8.5, color: mezclar(c.base, c.profundo, 0.3) }}>{firma}</Text>
            {marca.eslogan && (
              <Text style={{ fontFamily: t.serif ? "Playfair" : "Inter", fontStyle: t.serif ? "italic" : "normal", fontSize: 10, color: c.principal }}>{marca.eslogan}</Text>
            )}
          </View>
        </Page>
      )}

      <Page size="A4" style={paginaContenido}>
        <EncabezadoDelgado izquierda={marca.nombre} derecha={titulo.length > 70 ? `${titulo.slice(0, 67)}…` : titulo} colores={{ ...c, base: blanco }} marca={marca} desdePagina={2} />
        {!portadaCompleta && (
          // Portada ligera: la franja de la marca con el título (sube sobre el margen de arriba de la página).
          <View style={{ marginTop: -66, marginHorizontal: -M, backgroundColor: c.profundo, paddingHorizontal: M, paddingTop: 26, paddingBottom: 24, marginBottom: 22 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Logo tam={34} />
                <Text style={{ ...serif, fontSize: 12.5, color: c.principal, marginLeft: logo ? 10 : 0 }}>{marca.nombre}</Text>
              </View>
              <Text style={{ fontSize: 8.5, color: mezclar(c.base, c.profundo, 0.3) }}>{fecha}</Text>
            </View>
            <Text style={{ ...serif, fontSize: titulo.length > 70 ? 20 : 25, lineHeight: 1.2, color: blanco, marginTop: 22 }} maxLines={4}>
              {titulo}
            </Text>
            <View style={{ width: 48, height: 1.2, backgroundColor: c.principal, marginTop: 12, marginBottom: 9 }} />
            <Text style={{ fontSize: 9, color: mezclar(c.base, c.profundo, 0.3) }}>{preparado}</Text>
          </View>
        )}
        {elementos}
        <PieDePagina izquierda={firma} colores={{ ...c, base: blanco }} />
      </Page>
    </Document>
  );
}

function documento(datos: DatosPdfPatty, portadaCompleta: boolean) {
  return (<DocumentoPatty {...datos} portadaCompleta={portadaCompleta} />) as unknown as ReactElement<DocumentProps>;
}

export async function generarPdfPatty(datos: DatosPdfPatty): Promise<Buffer> {
  registrarFuentes();
  // El logo: una URL https tal cual o un archivo de marcas/ (solo dentro de esa carpeta).
  const archivo = datos.marca?.logoSobreProfundo || null;
  const logo = datos.logo ?? (archivo ? (/^https:\/\//.test(archivo) ? archivo : rutaDeMarca(archivo)) : null);
  const completos = { ...datos, logo };
  // Primero con portada ligera; si el documento pasa de 2 páginas, se arma con portada completa.
  const ligero = await renderToBuffer(documento(completos, false));
  return contarPaginas(ligero) > 2 ? renderToBuffer(documento(completos, true)) : ligero;
}
