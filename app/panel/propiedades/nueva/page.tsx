import Link from "next/link";
import { siguienteCodigo } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { crearPropiedad } from "../acciones";
import { FormularioPropiedad } from "../formulario";

export default async function NuevaPropiedad({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase.from("propiedades").select("codigo").eq("corredor_id", corredor.id);

  return (
    <>
      <p>
        <Link href="/panel/propiedades" className="suave">
          ← Propiedades
        </Link>
      </p>
      <header className="encabezado">
        <h1>Nueva propiedad</h1>
      </header>
      <Aviso texto={aviso} />
      <FormularioPropiedad
        accion={crearPropiedad}
        boton="Guardar y seguir con las fotos"
        p={{
          codigo: siguienteCodigo((data ?? []).map((x) => x.codigo as string)),
          titulo: "",
          tipo: "casa",
          operacion: "venta",
          precio: null,
          moneda: "USD",
          provincia: null,
          canton: null,
          distrito: null,
          zona: null,
          habitaciones: null,
          banos: null,
          m2_construccion: null,
          m2_terreno: null,
          descripcion: null,
          amenidades: [],
          url_e24: null,
          estado: "activa",
        }}
      />
    </>
  );
}
