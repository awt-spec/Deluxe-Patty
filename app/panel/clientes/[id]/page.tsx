import { notFound } from "next/navigation";
import { encaja, type Busca, type Etapa } from "@/lib/crm/perfil";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { cargarHistoria } from "./historia";
import { diasDesde, type VisitaFicha } from "./que-sigue";
import { FichaCliente, type CasaCorta, type CasaFicha, type ClienteFicha, type OtroCliente } from "./vista";
import "./ficha.css";

// Ficha de un cliente: lee con la sesión del corredor (RLS) y cada consulta filtra por su corredor_id.
// La forma está en vista.tsx; "Qué sigue" lo arma el código en que-sigue.ts.

export default async function Cliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { id } = await params;
  const { aviso } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const nombreAsistente = corredor.nombre_asistente ?? "Patty";

  const [{ data: c }, { data: conv }, { data: citas }, { data: casasData }, { data: todasData }, { data: otrosData }] = await Promise.all([
    supabase
      .from("contactos")
      .select(
        "id, nombre, telefono, email, origen, notas, etapa, etapa_at, busca, seguimiento_fecha, seguimiento_nota, motivo_perdida, created_at, ultima_actividad_at, anuncio_id, propiedad_interes_id, oferta_monto, oferta_moneda, cierre_propiedad_id, cierre_precio, cierre_comision, cierre_moneda, cierre_at",
      )
      .eq("corredor_id", corredor.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("conversaciones")
      .select("id")
      .eq("corredor_id", corredor.id)
      .eq("contacto_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("citas")
      .select("id, inicio, fin, estado, created_at, propiedades(titulo)")
      .eq("corredor_id", corredor.id)
      .eq("contacto_id", id)
      .order("inicio", { ascending: false })
      .limit(20),
    supabase
      .from("propiedades")
      .select("id, titulo, operacion, tipo, precio, moneda, zona, canton, habitaciones, fotos")
      .eq("corredor_id", corredor.id)
      .eq("estado", "activa")
      .limit(200),
    // Para la casa que le interesa y el cierre: todas las casas del corredor (también las vendidas).
    supabase.from("propiedades").select("id, titulo, precio, moneda, estado, operacion").eq("corredor_id", corredor.id).order("titulo").limit(300),
    // Otros clientes, para unir si son la misma persona.
    supabase.from("contactos").select("id, nombre, telefono, email").eq("corredor_id", corredor.id).eq("es_corredor", false).neq("id", id).order("nombre").limit(500),
  ]);
  if (!c) notFound();

  const busca = (c.busca ?? {}) as Busca;
  const activas = (casasData ?? []) as CasaFicha[];
  const todas = (todasData ?? []) as CasaCorta[];
  const conFoto = (casa: CasaCorta | undefined): CasaCorta | null => {
    if (!casa) return null;
    const activa = activas.find((p) => p.id === casa.id);
    return activa ? { ...casa, zona: activa.zona, fotos: activa.fotos } : casa;
  };
  const casaInteres = conFoto(todas.find((p) => p.id === c.propiedad_interes_id));
  const casaCierre = conFoto(todas.find((p) => p.id === c.cierre_propiedad_id));
  const otros = (otrosData ?? []) as OtroCliente[];
  // Los que parecen la misma persona (mismo nombre o correo) se avisan arriba.
  const norm = (t: string | null) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const parecidos = otros.filter(
    (o) => (c.nombre && norm(o.nombre) === norm(c.nombre as string)) || (c.email && o.email && norm(o.email) === norm(c.email as string)),
  );

  const filasCitas = (citas ?? []) as { id: string; inicio: string; fin: string | null; estado: string; created_at: string; propiedades: { titulo: string } | { titulo: string }[] | null }[];
  const casaDeCita = (p: (typeof filasCitas)[number]["propiedades"]) => ((Array.isArray(p) ? p[0] : p) as { titulo: string } | null)?.titulo ?? null;
  const visitas: VisitaFicha[] = filasCitas.map((v) => ({ id: v.id, inicio: v.inicio, fin: v.fin, estado: v.estado, casa: casaDeCita(v.propiedades) }));

  const [historia, { data: anuncio }] = await Promise.all([
    cargarHistoria(
      supabase,
      corredor.id,
      id,
      (conv?.id as string | undefined) ?? null,
      filasCitas.map((v) => ({ id: v.id, inicio: v.inicio, estado: v.estado, created_at: v.created_at, casa: casaDeCita(v.propiedades) })),
      zona,
      nombreAsistente,
    ),
    c.anuncio_id
      ? supabase.from("anuncios_e24").select("titulo, referencia").eq("corredor_id", corredor.id).eq("id", c.anuncio_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ahora = new Date();
  // Días sin que pase nada: lo último entre el cambio de etapa, lo anotado en su historia y sus mensajes.
  const ultimo = Math.max(
    Date.parse(c.etapa_at as string),
    c.ultima_actividad_at ? Date.parse(c.ultima_actividad_at as string) : 0,
    historia.ultimoMensaje?.getTime() ?? 0,
  );

  return (
    <FichaCliente
      c={{ ...(c as unknown as ClienteFicha), busca, etapa: c.etapa as Etapa }}
      aviso={aviso}
      conversacionId={(conv?.id as string | undefined) ?? null}
      visitas={visitas}
      casasEncajan={activas.filter((p) => encaja(busca, p)).slice(0, 8)}
      casaInteres={casaInteres}
      casaCierre={casaCierre}
      todas={todas}
      otros={otros}
      parecidos={parecidos}
      eventos={historia.eventos}
      diasSinMovimiento={diasDesde(new Date(ultimo), ahora)}
      anuncio={(anuncio as { titulo: string | null; referencia: string } | null) ?? null}
      vinoDelSitio={historia.vinoDelSitio}
      ahora={ahora}
      zona={zona}
      nombreAsistente={nombreAsistente}
      comisionPct={corredor.comision_pct ?? 5}
    />
  );
}
