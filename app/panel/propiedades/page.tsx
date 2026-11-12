import { IconoAgregar, IconoCasa } from "../iconos";
import Link from "next/link";
import { hayMonto, monedaDe, plataMontos, sumar } from "@/lib/crm/dinero";
import type { Foto } from "@/lib/datos/tipos";
import { precio } from "@/lib/formato";
import { ETIQUETA_ESTADO, ordenarFotos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../aviso";
import { PreguntarPatty } from "../preguntar-patty";

// Mis casas: arriba cuántas hay y cuánto valen (dólares y colones aparte); filtros por venta, alquiler
// y vendidas o pausadas, y un buscador. Cada casa con su foto, lo que es, sus datos, el movimiento
// (visitas que vienen y clientes interesados) y lo que le falta para venderse mejor.

type Fila = {
  id: string;
  codigo: string;
  titulo: string;
  tipo: string;
  operacion: string;
  precio: number | null;
  moneda: string;
  zona: string | null;
  canton: string | null;
  habitaciones: number | null;
  banos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  estado: keyof typeof ETIQUETA_ESTADO;
  fotos: Foto[];
};

const TIPO: Record<string, string> = { casa: "Casa", apartamento: "Apartamento", lote: "Lote", local: "Local", oficina: "Oficina", finca: "Finca", otro: "Propiedad" };
const FILTROS = [
  ["", "En oferta"],
  ["venta", "Venta"],
  ["alquiler", "Alquiler"],
  ["todas", "Otras"],
] as const;
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function Propiedades({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; ver?: string; q?: string }>;
}) {
  const { aviso, ver, q } = await searchParams;
  const filtro = (["venta", "alquiler", "todas"] as const).find((f) => f === ver) ?? "";
  const buscar = sinTildes((q ?? "").trim()).slice(0, 60);
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("propiedades")
    .select("id, codigo, titulo, tipo, operacion, precio, moneda, zona, canton, habitaciones, banos, m2_construccion, m2_terreno, estado, fotos")
    .eq("corredor_id", corredor.id)
    .order("updated_at", { ascending: false })
    .limit(300);
  const todas = (data ?? []) as Fila[];
  const enOferta = todas.filter((p) => p.estado === "activa" || p.estado === "reservada");
  const ids = todas.map((p) => p.id);

  // Movimiento de cada casa: visitas que vienen y clientes activos a los que les interesa.
  const [{ data: citasData }, { data: interesData }] = ids.length
    ? await Promise.all([
        supabase
          .from("citas")
          .select("propiedad_id")
          .eq("corredor_id", corredor.id)
          .in("estado", ["agendada", "confirmada"])
          .gte("inicio", new Date().toISOString())
          .in("propiedad_id", ids)
          .limit(1000),
        supabase
          .from("contactos")
          .select("propiedad_interes_id")
          .eq("corredor_id", corredor.id)
          .not("etapa", "in", "(cerrado,perdido)")
          .in("propiedad_interes_id", ids)
          .limit(1000),
      ])
    : [{ data: [] }, { data: [] }];
  const contar = (filas: Record<string, unknown>[] | null, campo: string) => {
    const m = new Map<string, number>();
    for (const f of filas ?? []) {
      const id = f[campo] as string | null;
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };
  const visitasDe = contar(citasData as never, "propiedad_id");
  const interesadosDe = contar(interesData as never, "propiedad_interes_id");

  const visibles = (filtro === "todas" ? todas.filter((p) => !enOferta.includes(p)) : enOferta)
    .filter((p) => !filtro || filtro === "todas" || p.operacion === filtro)
    .filter((p) => !buscar || sinTildes(`${p.titulo} ${p.codigo} ${p.zona ?? ""} ${p.canton ?? ""}`).includes(buscar));

  // Cifras de lo que está en oferta (las ventas, valor del inventario; dólares y colones aparte).
  const ventas = enOferta.filter((p) => p.operacion !== "alquiler");
  const alquileres = enOferta.filter((p) => p.operacion === "alquiler");
  const valorVentas = sumar(ventas.map((p) => ({ monto: Number(p.precio ?? 0), moneda: monedaDe(p.moneda) })));
  const porMejorar = enOferta.filter((p) => p.fotos.length < 5 || !p.precio).length;
  const enlace = (v: string) => `/panel/propiedades${v ? `?ver=${v}` : ""}`;

  return (
    <>
      <header className="encabezado casas-encabezado">
        <div>
          <h1>Mis casas</h1>
          <p className="suave">
            {enOferta.length} en oferta
            {todas.length > enOferta.length ? ` · ${todas.length - enOferta.length} vendidas o pausadas` : ""}
          </p>
        </div>
        <Link data-patty="casas-agregar" href="/panel/propiedades/nueva" className="boton primario">
          <IconoAgregar tamano={22} /> Agregar casa
        </Link>
      </header>
      <Aviso texto={aviso} />

      {enOferta.length > 0 && (
        <div className="cifras casas-cifras">
          <Link href={enlace("venta")} className="tarjeta cifra">
            <strong>{ventas.length}</strong>
            <span className="suave">en venta{hayMonto(valorVentas) ? ` · ${plataMontos(valorVentas)}` : ""}</span>
          </Link>
          <Link href={enlace("alquiler")} className="tarjeta cifra">
            <strong>{alquileres.length}</strong>
            <span className="suave">en alquiler</span>
          </Link>
          <div className="tarjeta cifra">
            <strong>{[...visitasDe.values()].reduce((s, n) => s + n, 0)}</strong>
            <span className="suave">visitas que vienen</span>
          </div>
          <div className={`tarjeta cifra${porMejorar ? " alerta" : ""}`}>
            <strong>{porMejorar}</strong>
            <span className="suave">{porMejorar === 1 ? "le falta foto o precio" : "les faltan fotos o precio"}</span>
          </div>
        </div>
      )}

      <div className="casas-barra">
        <nav className="cal-vistas casas-filtros" aria-label="Qué casas ver">
          {FILTROS.map(([v, nombre]) => (
            <Link key={v} href={enlace(v)} aria-current={filtro === v ? "page" : undefined}>
              {nombre}
            </Link>
          ))}
        </nav>
        <form className="casas-buscar" role="search">
          {filtro && <input type="hidden" name="ver" value={filtro} />}
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre, código o zona" aria-label="Buscar casa" />
        </form>
      </div>

      <div className="preguntas-patty">
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Qué casa le ofrezco a quién?" />
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Cómo agrego una casa?" />
      </div>

      {visibles.length === 0 && (
        <div className="vacio casas-vacio">
          <IconoCasa tamano={40} />
          <p>
            {buscar
              ? "No encontré casas con esa búsqueda."
              : filtro === "todas"
                ? "No tienes casas vendidas ni pausadas."
                : todas.length === 0
                  ? "Todavía no tienes casas. Agrégala contándola con tus palabras y la asistente arma la ficha."
                  : "No hay casas en esta lista."}
          </p>
          {todas.length === 0 && (
            <Link href="/panel/propiedades/nueva" className="boton primario">
              <IconoAgregar tamano={22} /> Agregar mi primera casa
            </Link>
          )}
        </div>
      )}

      <div className="casas-grid casas-lista">
        {visibles.map((p) => {
          const fotos = ordenarFotos(p.fotos);
          const principal = fotos[0];
          const datos = [
            p.habitaciones ? `${p.habitaciones} ${p.habitaciones === 1 ? "cuarto" : "cuartos"}` : null,
            p.banos ? `${String(p.banos).replace(".", ",")} ${p.banos === 1 ? "baño" : "baños"}` : null,
            p.m2_construccion ? `${Number(p.m2_construccion).toLocaleString("es-CR")} m²` : p.m2_terreno ? `${Number(p.m2_terreno).toLocaleString("es-CR")} m² terreno` : null,
          ].filter(Boolean);
          const visitas = visitasDe.get(p.id) ?? 0;
          const interesados = interesadosDe.get(p.id) ?? 0;
          const faltan = [
            fotos.length === 0 ? "Sin fotos" : fotos.length < 5 ? `Solo ${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}` : null,
            !p.precio ? "Sin precio" : null,
          ].filter(Boolean);
          return (
            <Link key={p.id} href={`/panel/propiedades/${p.id}`} className={`tarjeta casa-item estado-${p.estado}`}>
              <span className="casa-item-foto">
                {principal ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={principal.mejorada_url ?? principal.url} alt="" loading="lazy" />
                ) : (
                  <span className="sin-foto" aria-hidden>
                    <IconoCasa tamano={36} />
                  </span>
                )}
                <span className={`casa-item-operacion ${p.operacion === "alquiler" ? "alquiler" : "venta"}`}>
                  {p.operacion === "alquiler" ? "Alquiler" : "Venta"}
                </span>
                {p.estado !== "activa" && <span className={`casa-item-estado ${p.estado}`}>{ETIQUETA_ESTADO[p.estado]}</span>}
                {fotos.length > 1 && <span className="casa-item-fotos">{fotos.length} fotos</span>}
              </span>
              <span className="casa-item-cuerpo">
                <span className="casa-item-precio">
                  {p.precio !== null ? precio(p.precio, p.moneda) : "Sin precio"}
                  {p.operacion === "alquiler" && p.precio !== null && <small> al mes</small>}
                </span>
                <strong className="casa-item-titulo">{p.titulo}</strong>
                <span className="suave casa-item-lugar">
                  {TIPO[p.tipo] ?? "Propiedad"}
                  {p.zona || p.canton ? ` en ${p.zona ?? p.canton}` : ""} · {p.codigo}
                </span>
                {datos.length > 0 && <span className="casa-item-datos">{datos.join(" · ")}</span>}
                <span className="casa-item-pie">
                  {visitas > 0 && (
                    <span className="movimiento activo">
                      {visitas} {visitas === 1 ? "visita" : "visitas"}
                    </span>
                  )}
                  {interesados > 0 && (
                    <span className="movimiento activo">
                      {interesados} {interesados === 1 ? "interesado" : "interesados"}
                    </span>
                  )}
                  {faltan.map((f) => (
                    <span key={f} className="falta">
                      {f}
                    </span>
                  ))}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
