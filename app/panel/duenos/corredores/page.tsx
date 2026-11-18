import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { IconoPersonas } from "../../iconos";
import { EncabezadoPagina, Vacio } from "../../piezas";
import { agregarCorredores, quitarCorredor } from "./acciones";
import { ListaConocidos, type Conocido } from "./lista";
import "../duenos.css";

// Corredores conocidos: sus anuncios no salen como dueños directos. Arriba la lista con su buscador; agregar va
// plegado (abierto si todavía no hay ninguno). Se lee y se guarda con la sesión del corredor (RLS).

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
    <div className="dd-pagina cc-pagina">
      <EncabezadoPagina
        titulo="Corredores conocidos"
        apoyo="Sus anuncios no aparecen en Dueños directos. Se agregan solos cuando marcas un anuncio como «Es corredor»."
        atras={{ href: "/panel/duenos", texto: "Dueños directos" }}
      />
      <Aviso texto={aviso} />

      <details className="cc-agregar" open={lista.length === 0}>
        <summary>Agregar corredores</summary>
        <form action={agregarCorredores} className="pila">
          <label htmlFor="lista">Pega la lista: uno por línea, con nombre, teléfono o ambos</label>
          <textarea id="lista" name="lista" rows={5} placeholder={"María Solís, 8888-1234, RE/MAX\n7000-1111\nInmobiliaria del Oeste"} />
          <button type="submit" className="primario">
            Agregar
          </button>
        </form>
      </details>

      {lista.length === 0 ? (
        <Vacio Icono={IconoPersonas} titulo="Todavía no hay corredores conocidos">
          Agrega los que conoces, o toca «Es corredor» en un anuncio de Dueños directos: así no vuelven a salir.
        </Vacio>
      ) : (
        <ListaConocidos
          lista={lista}
          quitar={quitarCorredor}
        />
      )}
    </div>
  );
}
