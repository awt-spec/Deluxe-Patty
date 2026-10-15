import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PropiedadConFotos } from "../datos/tipos";
import type { Marca } from "./marca";

// Ficha de propiedad en PDF (carta, vertical). Tipografías del manual de Deluxe: Playfair Display
// para títulos y cifras, Inter para texto. Solo datos de la propiedad: nada se inventa.

const fuente = (paquete: string, archivo: string) =>
  path.join(process.cwd(), "node_modules", "@fontsource", paquete, "files", archivo);

let fuentesRegistradas = false;
export function registrarFuentes() {
  if (fuentesRegistradas) return;
  Font.register({
    family: "Playfair",
    fonts: [
      { src: fuente("playfair-display", "playfair-display-latin-400-normal.woff"), fontWeight: 400 },
      { src: fuente("playfair-display", "playfair-display-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: fuente("playfair-display", "playfair-display-latin-500-normal.woff"), fontWeight: 500 },
    ],
  });
  Font.register({
    family: "Inter",
    fonts: [
      { src: fuente("inter", "inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: fuente("inter", "inter-latin-500-normal.woff"), fontWeight: 500 },
      { src: fuente("inter", "inter-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((palabra) => [palabra]);
  fuentesRegistradas = true;
}

export interface DatosFicha {
  propiedad: PropiedadConFotos;
  marca: Marca;
  /** Número de WhatsApp de contacto (E.164). */
  whatsapp: string | null;
  /** QR (data URL PNG) al enlace de WhatsApp con la referencia. */
  qr: string | null;
  /** Fotos a usar (mejoradas si existen, si no la original), en orden. */
  fotos: string[];
}

function precio(p: PropiedadConFotos): string | null {
  if (p.precio === null) return null;
  const cifra = Math.round(p.precio).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const valor = p.moneda === "USD" ? `$${cifra}` : `${p.moneda} ${cifra}`;
  return p.operacion === "alquiler" ? `${valor} al mes` : valor;
}

function numero(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

function telefono(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.startsWith("506") && d.length === 11 ? `+506 ${d.slice(3, 7)} ${d.slice(7)}` : e164;
}

const TIPO: Record<string, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  lote: "Lote",
  local: "Local comercial",
  oficina: "Oficina",
  finca: "Finca",
  otro: "Propiedad",
};

export function FichaPropiedad({ propiedad: p, marca, whatsapp, qr, fotos }: DatosFicha) {
  const c = marca.colores;
  const s = StyleSheet.create({
    // El pie va en posición absoluta: el contenido deja libre su alto con paddingBottom.
    pagina: { backgroundColor: c.base, fontFamily: "Inter", color: c.profundo, fontSize: 9.5, paddingBottom: 112 },
    banda: {
      backgroundColor: marca.fondoLogo ?? c.profundo,
      height: 112,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 36,
    },
    etiqueta: { fontSize: 7, letterSpacing: 1.6, textTransform: "uppercase", color: c.soporte, fontWeight: 500 },
    hero: { width: "100%", height: 228, objectFit: "cover" },
    cuerpo: { paddingHorizontal: 48, paddingTop: 22 },
    titulo: { fontFamily: "Playfair", fontSize: 24, lineHeight: 1.2, marginTop: 6 },
    regla: { width: 56, height: 1, backgroundColor: c.principal, marginVertical: 12 },
    cifra: { fontFamily: "Playfair", fontSize: 17, color: c.profundo },
    texto: { fontSize: 9.5, lineHeight: 1.6 },
    pie: { position: "absolute", left: 48, right: 48, bottom: 20 },
  });

  const ubicacion = [p.distrito, p.canton, p.provincia].filter(Boolean).join(", ") || p.zona;
  const operacion = p.operacion === "alquiler" ? "En alquiler" : "En venta";
  const datos = [
    p.habitaciones !== null ? { valor: numero(p.habitaciones), etiqueta: p.habitaciones === 1 ? "Habitación" : "Habitaciones" } : null,
    p.banos !== null ? { valor: numero(p.banos), etiqueta: p.banos === 1 ? "Baño" : "Baños" } : null,
    p.m2_construccion !== null ? { valor: `${numero(p.m2_construccion)} m²`, etiqueta: "Construcción" } : null,
    p.m2_terreno !== null ? { valor: `${numero(p.m2_terreno)} m²`, etiqueta: "Terreno" } : null,
  ].filter((d): d is { valor: string; etiqueta: string } => d !== null);
  const valorPrecio = precio(p);
  const [principal, ...resto] = fotos;
  const galeria = resto.slice(0, 6);

  const Rombo = () => (
    <View style={{ width: 4, height: 4, backgroundColor: c.principal, transform: "rotate(45deg)", marginRight: 8, marginTop: 4 }} />
  );

  const Pie = ({ pagina }: { pagina: number }) => (
    <View style={s.pie} fixed>
      <View style={{ height: 0.75, backgroundColor: c.principal, marginBottom: 14 }} />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flexGrow: 1 }}>
          {marca.firma && (
            <>
              <Text style={{ fontFamily: "Playfair", fontSize: 12 }}>{marca.firma.nombre}</Text>
              <Text style={{ fontFamily: "Playfair", fontStyle: "italic", fontSize: 9, color: c.soporte, marginTop: 2 }}>
                {marca.firma.cargo}
              </Text>
            </>
          )}
          {whatsapp && <Text style={{ fontSize: 9, marginTop: 6 }}>WhatsApp {telefono(whatsapp)}</Text>}
        </View>
        {marca.eslogan && (
          <Text style={{ fontFamily: "Playfair", fontStyle: "italic", fontSize: 11, color: c.soporte, marginRight: qr ? 18 : 0 }}>
            {marca.eslogan}
          </Text>
        )}
        {qr && pagina === 1 && <Image src={qr} style={{ width: 54, height: 54 }} />}
      </View>
      <Text style={{ textAlign: "center", fontFamily: "Playfair", fontSize: 8, color: c.soporte, marginTop: 10 }}>
        — {pagina} —
      </Text>
    </View>
  );

  return (
    <Document title={`${p.titulo} · ${marca.nombre}`} author={marca.nombre} language="es">
      <Page size="LETTER" style={s.pagina}>
        <View style={s.banda}>
          <Image src={marca.logoSobreProfundo} style={{ width: 104, height: 104 }} />
          <View style={{ flexGrow: 1, alignItems: "flex-end" }}>
            <Text style={[s.etiqueta, { color: c.principal }]}>Ficha de propiedad</Text>
            <Text style={[s.etiqueta, { marginTop: 5 }]}>Ref. {p.codigo}</Text>
          </View>
        </View>

        {principal && <Image src={principal} style={s.hero} />}

        <View style={s.cuerpo}>
          <Text style={s.etiqueta}>
            {operacion}
            {ubicacion ? ` · ${ubicacion}` : ""}
          </Text>
          <Text style={s.titulo}>{p.titulo}</Text>
          <View style={s.regla} />

          {datos.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                borderTopWidth: 0.75,
                borderBottomWidth: 0.75,
                borderColor: c.soporte,
                paddingVertical: 10,
                marginBottom: 16,
              }}
            >
              {datos.map((d, i) => (
                <View
                  key={d.etiqueta}
                  style={{
                    flexGrow: 1,
                    flexBasis: 0,
                    alignItems: "center",
                    borderLeftWidth: i === 0 ? 0 : 0.75,
                    borderLeftColor: c.soporte,
                  }}
                >
                  <Text style={s.cifra}>{d.valor}</Text>
                  <Text style={[s.etiqueta, { marginTop: 3 }]}>{d.etiqueta}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ flexDirection: "row" }} wrap={false}>
            <View style={{ width: "60%", paddingRight: 26 }}>
              {p.descripcion && <Text style={s.texto}>{p.descripcion}</Text>}
            </View>
            <View style={{ width: "40%" }}>
              {valorPrecio && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={s.etiqueta}>{TIPO[p.tipo] ?? "Propiedad"} · Precio</Text>
                  <Text style={{ fontFamily: "Playfair", fontSize: 24, marginTop: 4 }}>{valorPrecio}</Text>
                </View>
              )}
              {p.amenidades.length > 0 && (
                <View>
                  <Text style={[s.etiqueta, { marginBottom: 8 }]}>Amenidades</Text>
                  {p.amenidades.slice(0, 6).map((a) => (
                    <View key={a} style={{ flexDirection: "row", marginBottom: 5 }}>
                      <Rombo />
                      <Text style={{ fontSize: 9.5 }}>{a.charAt(0).toUpperCase() + a.slice(1)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
        <Pie pagina={1} />
      </Page>

      {galeria.length > 0 && (
        <Page size="LETTER" style={s.pagina}>
          <View style={{ paddingHorizontal: 48, paddingTop: 30 }}>
            <Text style={[s.etiqueta, { textAlign: "center" }]}>
              {marca.nombre} · Ref. {p.codigo}
            </Text>
            <Text style={[s.titulo, { fontSize: 20, textAlign: "center", marginTop: 14 }]}>{p.titulo}</Text>
            <View style={[s.regla, { alignSelf: "center" }]} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 48, justifyContent: "space-between" }}>
            {galeria.map((f, i) => (
              <Image key={i} src={f} style={{ width: "49%", height: 172, objectFit: "cover", marginBottom: 8 }} />
            ))}
          </View>
          <Pie pagina={2} />
        </Page>
      )}
    </Document>
  );
}
