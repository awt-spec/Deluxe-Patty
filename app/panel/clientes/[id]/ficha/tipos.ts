import type { Busca, Etapa } from "@/lib/crm/perfil";
import type { Foto } from "@/lib/datos/tipos";
import type { EventoHistoria } from "../historia";
import type { VisitaFicha } from "../que-sigue";

// Lo que la página (page.tsx) le pasa a la ficha del cliente. vista.tsx los vuelve a exportar.

export type CasaFicha = {
  id: string;
  titulo: string;
  operacion: string;
  tipo: string;
  precio: number | null;
  moneda: string;
  zona: string | null;
  canton: string | null;
  habitaciones: number | null;
  fotos: Foto[];
};
export type CasaCorta = { id: string; titulo: string; precio: number | null; moneda: string; estado: string; operacion: string; zona?: string | null; fotos?: Foto[] };
export type OtroCliente = { id: string; nombre: string | null; telefono: string; email: string | null };

export interface ClienteFicha {
  id: string;
  nombre: string | null;
  telefono: string;
  origen: string;
  notas: string | null;
  etapa: Etapa;
  etapa_at: string;
  busca: Busca;
  seguimiento_fecha: string | null;
  seguimiento_nota: string | null;
  motivo_perdida: string | null;
  created_at: string;
  oferta_monto: number | null;
  oferta_moneda: string | null;
  cierre_precio: number | null;
  cierre_comision: number | null;
  cierre_moneda: string | null;
  cierre_at: string | null;
}

export interface DatosFicha {
  c: ClienteFicha;
  aviso?: string;
  conversacionId: string | null;
  visitas: VisitaFicha[];
  casasEncajan: CasaFicha[];
  casaInteres: CasaCorta | null;
  casaCierre: CasaCorta | null;
  todas: CasaCorta[];
  otros: OtroCliente[];
  parecidos: OtroCliente[];
  eventos: EventoHistoria[];
  diasSinMovimiento: number;
  anuncio: { titulo: string | null; referencia: string } | null;
  vinoDelSitio: boolean;
  ahora: Date;
  zona: string;
  nombreAsistente: string;
  comisionPct: number;
}
