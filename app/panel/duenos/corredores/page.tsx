import { Volver } from "../../volver";
import Link from "next/link";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { agregarCorredores, quitarCorredor } from "./acciones";

type Conocido = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  empresa: string | null;
  anunciante_e24_id: string | null;
};

export default async function CorredoresConocidos({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("corredores_bloqueados")
    .select("id, nombre, telefono, empresa, anunciante_e24_id")
    .eq("corredor_id", corredor.id)
    .order("created_at", { ascending: false })
    .limit(500);
  const lista = (data ?? []) as Conocido[];

  return (
    <>
      <Volver href="/panel/duenos" texto="Dueños" />
      <header className="encabezado">
        <h1>Corredores conocidos</h1>
      </header>
      <Aviso texto={aviso} />
      <p className="suave">
        Sus anuncios no aparecen en la lista semanal de dueños directos. También se agregan solos cuando marcas un anuncio
        como “Es corredor”.
      </p>

      <form action={agregarCorredores} className="pila tarjeta">
        <label htmlFor="lista">Pega la lista: uno por línea, con nombre, teléfono o ambos</label>
        <textarea id="lista" name="lista" rows={6} placeholder={"María Solís, 8888-1234, RE/MAX\n7000-1111\nInmobiliaria del Oeste"} />
        <button type="submit" className="primario">
          Agregar
        </button>
      </form>

      <h2>
        {lista.length} {lista.length === 1 ? "corredor" : "corredores"}
      </h2>
      {lista.map((c) => (
        <form key={c.id} action={quitarCorredor} className="tarjeta fila">
          <div style={{ minWidth: 0 }}>
            <strong>{c.nombre ?? c.telefono ?? "Cuenta de Encuentra24"}</strong>
            <p className="suave">
              {[c.nombre ? c.telefono : null, c.empresa, c.anunciante_e24_id ? "marcado desde un anuncio" : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <input type="hidden" name="id" value={c.id} />
          <button type="submit" className="chico peligro">
            Quitar
          </button>
        </form>
      ))}
    </>
  );
}
