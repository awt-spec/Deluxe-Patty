// Páginas con la misma estructura que Encuentra24 (payload RSC partido en fragmentos
// self.__next_f.push) y datos ficticios.

export function anuncioE24(id: number | string, tipo: string, nombre: string, extra: Record<string, unknown> = {}) {
  return {
    allowContactByForm: true,
    dateCreated: "$D2026-10-15T15:49:59.000Z",
    dateUpdated: "$D2026-10-15T15:49:59.000Z",
    description: `Casa de prueba {${id}} con "comillas" y <br />\nsalto.`,
    featured: tipo === "Agente" ? "platinum" : null,
    fieldset: "property",
    id: String(id),
    link: `/costa-rica-es/bienes-raices-venta-de-propiedades-casas/casa-de-prueba/${id}`,
    location: { locality: "San José provincia, Escazú, San Rafael", lat: 9.9, lon: -84.1 },
    price: { currency: { symbol: "USD" }, amount: { value: 350000, formatted: "" } },
    principalImage: `https://photos.example/${id}.jpg`,
    title: `Casa de prueba ${id} `,
    user: { id: `u${id}`, name: nombre, verified: false, contact: { whatsapp: "xx", company: null, license: "" } },
    square: "220",
    rooms: "3",
    bathrooms: "2",
    lotSize: "$undefined",
    advertiserType: tipo,
    ...extra,
  };
}

export function paginaE24(anuncios: object[]): string {
  const rsc = `5:["$","div",null,${JSON.stringify({ ads: anuncios })}]\n`;
  const corte = Math.floor(rsc.length / 2);
  const push = (t: string) => `<script>self.__next_f.push([1,${JSON.stringify(t)}])</script>`;
  return `<!DOCTYPE html><html><body><div>listado</div>${push(rsc.slice(0, corte))}${push(rsc.slice(corte))}</body></html>`;
}
