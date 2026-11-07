// Enlaces para llegar a una casa con Waze o Google Maps: abren la app del teléfono (o la página en la
// computadora) con la ruta lista. Sin coordenadas, se busca por zona y cantón en Costa Rica.

export function destino(casa: { zona: string | null; canton?: string | null }): string | null {
  if (!casa.zona && !casa.canton) return null;
  return [casa.zona, casa.canton && casa.canton !== casa.zona ? casa.canton : null, "Costa Rica"].filter(Boolean).join(", ");
}

export const enlaceWaze = (lugar: string) => `https://waze.com/ul?q=${encodeURIComponent(lugar)}&navigate=yes`;

export const enlaceMaps = (lugar: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lugar)}&travelmode=driving`;
