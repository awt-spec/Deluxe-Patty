import { PREFIJO_UBICACION, leerTemaUbicacion } from "@/lib/sitio/ubicacion";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { VISTAS, VistaCerebro, type PorUbicar, type Ver } from "./vista";
import type { Ubicada } from "./lo-que-sabe";
import "./cerebro.css";

// Segundo cerebro de la asistente: qué sabe, de dónde aprende y qué no supo contestar. Cada duda que el
// corredor responde pasa a ser algo que la asistente ya sabe y usa al contestar. Esta página solo lee con la
// sesión (RLS) y pasa los datos a la vista (vista.tsx).

type Item = { id: string; tema: string; respuesta: string | null; origen: string; veces: number; updated_at: string; estado: string };
type Casa = { id: string; titulo: string; codigo: string | null; precio: number | null; fotos: unknown; estado: string };

export default async function Cerebro({ searchParams }: { searchParams: Promise<{ ver?: string; aviso?: string }> }) {
  const { ver: pedido, aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const [{ data: items, error: errorCerebro }, { data: correcciones }, { data: casasData }, { data: franjasData }] = await Promise.all([
    supabase
      .from("conocimiento")
      .select("id, tema, respuesta, origen, veces, updated_at, estado")
      .eq("corredor_id", corredor.id)
      .neq("estado", "archivado")
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("correcciones")
      .select("id, original, corregido, created_at")
      .eq("corredor_id", corredor.id)
      .order("created_at", { ascending: false })
      .limit(20),
    // Todas las casas (no solo las activas): una pregunta de ubicación puede ser de una casa pausada.
    supabase.from("propiedades").select("id, titulo, codigo, precio, fotos, estado").eq("corredor_id", corredor.id).limit(300),
    supabase.from("horarios_visitas").select("dia_semana, hora_inicio, hora_fin").eq("corredor_id", corredor.id).order("dia_semana"),
  ]);
  const todos = (items ?? []) as Item[];
  const casasTodas = (casasData ?? []) as Casa[];
  const porCodigo = new Map(casasTodas.filter((c) => c.codigo).map((c) => [c.codigo!.toUpperCase(), c]));
  const esUbicacion = (i: Item) => i.tema.startsWith(PREFIJO_UBICACION);

  // Las preguntas de ubicación se contestan en la casa (elegir la zona), no con texto libre: van aparte.
  const porUbicar: PorUbicar[] = [];
  for (const i of todos.filter((x) => x.estado === "pendiente" && esUbicacion(x))) {
    const p = leerTemaUbicacion(i.tema);
    const casa = p && porCodigo.get(p.codigo);
    if (p && casa && !porUbicar.some((u) => u.casaId === casa.id)) porUbicar.push({ id: i.id, casaId: casa.id, codigo: p.codigo, titulo: p.titulo, sitio: p.sitio });
  }
  const ubicadas: Ubicada[] = [];
  for (const i of todos.filter((x) => x.estado === "activo" && esUbicacion(x))) {
    const p = leerTemaUbicacion(i.tema);
    if (!p) continue;
    const casa = porCodigo.get(p.codigo);
    ubicadas.push({ id: i.id, codigo: p.codigo, titulo: casa?.titulo ?? p.titulo, zona: i.respuesta ?? "", casaId: casa?.id ?? null, updated_at: i.updated_at });
  }

  const ver: Ver = VISTAS.find((v) => v === pedido) ?? "inicio";
  return (
    <VistaCerebro
      ver={ver}
      aviso={aviso}
      errorCodigo={errorCerebro ? (errorCerebro.code ?? "") : null}
      nombre={corredor.nombre_asistente || "Patty"}
      dudas={todos.filter((i) => i.estado === "pendiente" && !esUbicacion(i))}
      porUbicar={porUbicar}
      sabe={todos.filter((i) => i.estado === "activo" && !esUbicacion(i))}
      ubicadas={ubicadas}
      correcciones={(correcciones ?? []) as { id: string; original: string; corregido: string; created_at: string }[]}
      casas={casasTodas
        .filter((c) => c.estado === "activa")
        .map((c) => ({ id: c.id, titulo: c.titulo, precio: c.precio, fotos: Array.isArray(c.fotos) ? c.fotos.length : 0 }))}
      franjas={(franjasData ?? []) as { dia_semana: number; hora_inicio: string; hora_fin: string }[]}
      tono={corredor.tono ?? ""}
      temas={corredor.reglas_escalamiento ?? []}
    />
  );
}
