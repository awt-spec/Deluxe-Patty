import { IconoAgregar, IconoCasa } from "../iconos";
import Link from "next/link";
import type { Foto } from "@/lib/datos/tipos";
import { precio } from "@/lib/formato";
import { ETIQUETA_ESTADO, ordenarFotos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../aviso";

type Fila = {
  id: string;
  codigo: string;
  titulo: string;
  operacion: string;
  precio: number | null;
  moneda: string;
  zona: string | null;
  estado: keyof typeof ETIQUETA_ESTADO;
  fotos: Foto[];
};

export default async function Propiedades({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; ver?: string }>;
}) {
  const { aviso, ver } = await searchParams;
  const todas = ver === "todas";
  const { supabase, corredor } = await sesionConCorredor();
  let consulta = supabase
    .from("propiedades")
    .select("id, codigo, titulo, operacion, precio, moneda, zona, estado, fotos")
    .eq("corredor_id", corredor.id)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (!todas) consulta = consulta.in("estado", ["activa", "reservada"]);
  const { data } = await consulta;
  const propiedades = (data ?? []) as Fila[];

  return (
    <>
      <header className="encabezado">
        <h1>Mis casas</h1>
      </header>
      <Aviso texto={aviso} />
      <Link href="/panel/propiedades/nueva" className="boton primario grande" style={{ marginBottom: 14 }}>
        <IconoAgregar tamano={24} /> Agregar casa
      </Link>
      {propiedades.length === 0 && (
        <p className="vacio">{todas ? "Todavía no tienes casas cargadas." : "No tienes casas en oferta."}</p>
      )}
      <div className="casas-grid">
      {propiedades.map((p) => {
        const principal = ordenarFotos(p.fotos)[0];
        return (
          <Link key={p.id} href={`/panel/propiedades/${p.id}`} className="tarjeta propiedad">
            {principal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={principal.url} alt="" loading="lazy" />
            ) : (
              <span className="sin-foto" aria-hidden>
                <IconoCasa tamano={36} />
              </span>
            )}
            <div className="pila" style={{ gap: 2, minWidth: 0 }}>
              <strong className="recortado">{p.titulo}</strong>
              <span className="suave">
                {p.codigo}
                {p.zona && ` · ${p.zona}`}
              </span>
              <span>
                {p.precio !== null ? precio(p.precio, p.moneda) : "Sin precio"}
                {p.operacion === "alquiler" && p.precio !== null && <span className="suave"> al mes</span>}
              </span>
            </div>
            {p.estado !== "activa" && <span className="insignia">{ETIQUETA_ESTADO[p.estado]}</span>}
          </Link>
        );
      })}
      </div>
      <p style={{ marginTop: 12 }}>
        {todas ? (
          <Link href="/panel/propiedades" className="suave">
            Ver solo las que están en oferta
          </Link>
        ) : (
          <Link href="/panel/propiedades?ver=todas" className="suave">
            Ver también las vendidas o pausadas
          </Link>
        )}
      </p>
    </>
  );
}
