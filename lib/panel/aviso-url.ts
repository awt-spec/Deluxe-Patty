// Los avisos del panel vuelven en ?aviso= después de una acción. Se muestran una vez: luego se quitan de la dirección
// (app/panel/aviso-de-una-vez.tsx) para que "Atrás" o recargar no los repitan. Pura, para probarla.

/** La dirección sin `aviso` (ruta, el resto de la búsqueda y el ancla), o null si no tenía aviso. */
export function sinAviso(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has("aviso")) return null;
  url.searchParams.delete("aviso");
  const busqueda = url.searchParams.toString();
  return `${url.pathname}${busqueda ? `?${busqueda}` : ""}${url.hash}`;
}
