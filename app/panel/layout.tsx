import { PantallaEntrada } from "@/app/entrar/pantalla";
import { marcaDeEntrada } from "@/lib/panel/marca";
import { sesionCorredor } from "@/lib/panel/sesion";
import { salir } from "./acciones";
import { Navegacion } from "./navegacion";
import { Patty } from "./patty";

export const dynamic = "force-dynamic";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const { supabase, corredor } = await sesionCorredor();
  if (!corredor) {
    return (
      <PantallaEntrada marca={await marcaDeEntrada()}>
        <h1>Todavía no tienes acceso</h1>
        <p className="suave">Tu correo entró bien, pero aún no está enlazado a tu cuenta. Escríbele a soporte y te lo activan.</p>
        <form action={salir}>
          <button type="submit" className="grande">
            Entrar con otro correo
          </button>
        </form>
      </PantallaEntrada>
    );
  }

  // Cuántos clientes esperan a la corredora (respuestas por aprobar o que pidieron hablar con ella):
  // el número que se ve sobre "Chats".
  const [{ data: borradores }, { data: escaladas }] = await Promise.all([
    supabase.from("mensajes").select("conversacion_id").eq("corredor_id", corredor.id).eq("estado_borrador", "pendiente"),
    supabase.from("conversaciones").select("id").eq("corredor_id", corredor.id).eq("estado", "escalada"),
  ]);
  const teNecesitan = new Set([
    ...(borradores ?? []).map((b) => b.conversacion_id as string),
    ...(escaladas ?? []).map((c) => c.id as string),
  ]).size;

  // El panel se ve como WhatsApp (claro, con su verde): lo que la corredora ya usa todos los días. La
  // marca del corredor queda en la entrada, el logo y las fichas.
  return (
    <div className="marco tema">
      {corredor.activo === false && (
        <p className="banda-demo" role="note">
          Estás en la demo: casas y clientes de prueba. Nada se manda por WhatsApp.
        </p>
      )}
      <main className="panel">{children}</main>
      <Navegacion teNecesitan={teNecesitan} marca={corredor.nombre} />
      <Patty nombre={corredor.nombre_asistente ?? "Patty"} corredor={corredor.id} />
    </div>
  );
}
