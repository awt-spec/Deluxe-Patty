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
        <h1>Propiedades</h1>
        <Link href="/panel/propiedades/nueva" className="boton primario">
          Nueva
        </Link>
      </header>
      <Aviso texto={aviso} />
      <nav className="pestanas" aria-label="Filtro">
        <Link href="/panel/propiedades" aria-current={todas ? undefined : "page"}>
          En oferta
        </Link>
        <Link href="/panel/propiedades?ver=todas" aria-current={todas ? "page" : undefined}>
          Todas
        </Link>
      </nav>
      <p className="suave">La asistente les habla a los clientes solo de las activas.</p>
      {propiedades.length === 0 && (
        <p className="vacio">{todas ? "Todavía no hay propiedades." : "No hay propiedades en oferta."}</p>
      )}
      {propiedades.map((p) => {
        const principal = ordenarFotos(p.fotos)[0];
        return (
          <Link key={p.id} href={`/panel/propiedades/${p.id}`} className="tarjeta propiedad">
            {principal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={principal.url} alt="" loading="lazy" />
            ) : (
              <span className="sin-foto" aria-hidden>
                ⌂
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
    </>
  );
}
