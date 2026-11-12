import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { registrarFuentes } from "../fichas/ficha";
import type { Marca } from "../fichas/marca";
import { bloques, trozos, type Bloque } from "./markdown";

// Documento PDF con lo que preparó Patty (un informe, una comparación, un resumen para un cliente), con los
// colores y el nombre del corredor. Los diagramas llegan ya dibujados como PNG desde el navegador, en orden.

const COLORES_NEUTROS = { principal: "#00a884", soporte: "#54656f", profundo: "#111b21", base: "#ffffff" };

function Linea({ texto, color }: { texto: string; color: string }) {
  return (
    <>
      {trozos(texto).map((t, i) => {
        if (t.tipo === "negrita") return <Text key={i} style={{ fontWeight: 600, color }}>{t.texto}</Text>;
        if (t.tipo === "imagen") return null;
        return <Text key={i}>{t.texto}</Text>;
      })}
    </>
  );
}

export interface DatosPdfPatty {
  titulo: string;
  texto: string;
  /** Diagramas como data:image/png;base64, en el orden en que aparecen. */
  diagramas: string[];
  marca: Marca | null;
  corredor: string;
  fecha: string;
}

function DocumentoPatty({ titulo, texto, diagramas, marca, corredor, fecha }: DatosPdfPatty) {
  const c = marca?.colores ?? COLORES_NEUTROS;
  const e = StyleSheet.create({
    pagina: { fontFamily: "Inter", fontSize: 10.5, color: "#1f2a30", paddingTop: 0, paddingBottom: 48, paddingHorizontal: 0, lineHeight: 1.45 },
    franja: { backgroundColor: c.profundo, paddingHorizontal: 40, paddingVertical: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    marca: { color: c.principal, fontFamily: "Playfair", fontSize: 15 },
    fecha: { color: "#ffffff", fontSize: 9, opacity: 0.8 },
    cuerpo: { paddingHorizontal: 40, paddingTop: 24 },
    titulo: { fontFamily: "Playfair", fontSize: 22, lineHeight: 1.25, color: c.profundo, marginBottom: 8 },
    linea: { height: 2, width: 48, backgroundColor: c.principal, marginBottom: 16 },
    h1: { fontSize: 15, fontWeight: 600, color: c.profundo, marginTop: 12, marginBottom: 6 },
    h2: { fontSize: 13, fontWeight: 600, color: c.profundo, marginTop: 10, marginBottom: 5 },
    h3: { fontSize: 11.5, fontWeight: 600, color: c.soporte, marginTop: 8, marginBottom: 4 },
    parrafo: { marginBottom: 7 },
    item: { flexDirection: "row", marginBottom: 3, paddingRight: 8 },
    vineta: { width: 16, color: c.principal, fontWeight: 600 },
    tabla: { borderWidth: 1, borderColor: "#d7dde2", borderRadius: 4, marginVertical: 8 },
    filaCab: { flexDirection: "row", backgroundColor: c.profundo },
    fila: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#e3e7ea" },
    celdaCab: { flex: 1, padding: 6, color: "#ffffff", fontWeight: 600, fontSize: 9.5 },
    celda: { flex: 1, padding: 6, fontSize: 9.5 },
    cita: { borderLeftWidth: 3, borderLeftColor: c.principal, paddingLeft: 10, marginVertical: 6, color: "#3b4a54" },
    codigo: { fontSize: 9, backgroundColor: "#f3f5f7", padding: 8, borderRadius: 4, marginVertical: 6 },
    diagrama: { marginVertical: 10, alignItems: "center" },
    imagenDiagrama: { maxWidth: 515, maxHeight: 420, objectFit: "contain" },
    pie: { position: "absolute", bottom: 18, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#7a868e" },
  });

  // El título ya va arriba: si el texto empieza con el mismo título (# …), no se repite.
  const todos = bloques(texto);
  const lista = todos[0]?.tipo === "titulo" && todos[0].nivel === 1 ? todos.slice(1) : todos;
  let diagrama = 0;
  const bloque = (b: Bloque, i: number) => {
    switch (b.tipo) {
      case "titulo":
        return (
          <Text key={i} style={b.nivel === 1 ? e.h1 : b.nivel === 2 ? e.h2 : e.h3} minPresenceAhead={40}>
            <Linea texto={b.texto} color={c.profundo} />
          </Text>
        );
      case "parrafo":
        return (
          <Text key={i} style={e.parrafo}>
            <Linea texto={b.texto} color={c.profundo} />
          </Text>
        );
      case "lista":
        return (
          <View key={i} style={{ marginBottom: 7 }}>
            {b.items.map((it, j) => (
              <View key={j} style={e.item} wrap={false}>
                <Text style={e.vineta}>{b.ordenada ? `${j + 1}.` : "•"}</Text>
                <Text style={{ flex: 1 }}>
                  <Linea texto={it} color={c.profundo} />
                </Text>
              </View>
            ))}
          </View>
        );
      case "tabla":
        return (
          <View key={i} style={e.tabla}>
            <View style={e.filaCab} fixed={false}>
              {b.cabecera.map((h, j) => (
                <Text key={j} style={e.celdaCab}>
                  {h.replace(/\*\*/g, "")}
                </Text>
              ))}
            </View>
            {b.filas.map((f, j) => (
              <View key={j} style={[e.fila, j % 2 ? { backgroundColor: "#f7f9fa" } : {}]} wrap={false}>
                {f.map((celda, k) => (
                  <Text key={k} style={e.celda}>
                    <Linea texto={celda} color={c.profundo} />
                  </Text>
                ))}
              </View>
            ))}
          </View>
        );
      case "cita":
        return (
          <Text key={i} style={e.cita}>
            <Linea texto={b.texto} color={c.profundo} />
          </Text>
        );
      case "codigo": {
        if (b.lenguaje === "mermaid") {
          const png = diagramas[diagrama++];
          return png ? (
            <View key={i} style={e.diagrama} wrap={false}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no lleva alt */}
              <Image src={png} style={e.imagenDiagrama} />
            </View>
          ) : null;
        }
        return (
          <Text key={i} style={e.codigo}>
            {b.texto}
          </Text>
        );
      }
    }
  };

  return (
    <Document title={titulo} author={marca?.nombre ?? corredor} creator={marca?.nombre ?? corredor}>
      <Page size="A4" style={e.pagina}>
        <View style={e.franja} fixed>
          <Text style={e.marca}>{marca?.nombre ?? corredor}</Text>
          <Text style={e.fecha}>{fecha}</Text>
        </View>
        <View style={e.cuerpo}>
          <Text style={e.titulo}>{titulo}</Text>
          <View style={e.linea} />
          {lista.map(bloque)}
        </View>
        <View style={e.pie} fixed>
          <Text>{marca?.firma ? `${marca.firma.nombre} · ${marca.firma.cargo}` : (marca?.nombre ?? corredor)}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function generarPdfPatty(datos: DatosPdfPatty): Promise<Buffer> {
  registrarFuentes();
  return renderToBuffer(<DocumentoPatty {...datos} /> as unknown as ReactElement<DocumentProps>);
}
