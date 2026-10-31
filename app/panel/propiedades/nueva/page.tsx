import { Volver } from "../../volver";
import Link from "next/link";
import { siguienteCodigo } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { crearPropiedad } from "../acciones";
import { FormularioPropiedad } from "../formulario";
import { ChatCasa } from "./chat-casa";

// Cada turno del chat llama a Claude.
export const maxDuration = 60;

export default async function NuevaPropiedad({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; formulario?: string }>;
}) {
  const { aviso, formulario } = await searchParams;
  // Lo normal es contarla en el chat; el formulario completo queda para soporte.
  if (formulario !== "1") {
    return (
      <>
        <Volver href="/panel/propiedades" texto="Mis casas" />
        <header className="encabezado">
          <h1>Agregar casa</h1>
        </header>
        <ChatCasa />
        <p className="suave" style={{ marginTop: 16 }}>
          <Link href="/panel/propiedades/nueva?formulario=1">Prefiero llenar el formulario</Link>
        </p>
      </>
    );
  }
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase.from("propiedades").select("codigo").eq("corredor_id", corredor.id);

  return (
    <>
      <Volver href="/panel/propiedades" texto="Mis casas" />
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
