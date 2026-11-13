// Orden de Mis casas: lo que se ofrece primero y las pausadas siempre al final, en su propio grupo, en cualquier
// filtro (En oferta, Venta, Alquiler u Otras) y con cualquier búsqueda. Dentro de cada grupo se respeta el orden en
// que llegan (la última que se movió primero). Las vendidas o alquiladas solo salen en "Otras".

export type FiltroCasas = "" | "venta" | "alquiler" | "todas";

type CasaOrdenable = { estado: string; operacion: string };

export const enOferta = (c: CasaOrdenable) => c.estado === "activa" || c.estado === "reservada";
export const pausada = (c: CasaOrdenable) => c.estado === "inactiva";

export function ordenarCasas<T extends CasaOrdenable>(casas: T[], filtro: FiltroCasas, coincide: (c: T) => boolean = () => true): { principales: T[]; pausadas: T[] } {
  const delFiltro = casas.filter((c) => (filtro === "venta" || filtro === "alquiler" ? c.operacion === filtro : true) && coincide(c));
  const principales = delFiltro.filter((c) => (filtro === "todas" ? !enOferta(c) && !pausada(c) : enOferta(c)));
  return { principales, pausadas: delFiltro.filter(pausada) };
}
