import { PantallaEntrada } from "@/app/entrar/pantalla";
import { marcaDeEntrada } from "@/lib/panel/marca";
import { redirect } from "next/navigation";
import { esSuperadmin } from "@/lib/admin/superadmin";
import { sesionCorredor } from "@/lib/panel/sesion";
import { salir } from "./acciones";
import { coloresMenu, variablesMenu } from "@/lib/panel/colores-menu";
import { limitesDia } from "@/lib/agenda/tiempo";
import { MenuLateral } from "./menu-lateral";
import { Navegacion } from "./navegacion";
import { Patty } from "./patty";

export const dynamic = "force-dynamic";
// Patty (chat e imágenes) corre como acción desde cualquier pantalla del panel: que ninguna la corte antes
// de lo que puede tardar una llamada a la IA (ver lib/asistente/cliente-claude.ts).
export const maxDuration = 300;

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const { supabase, corredor, usuario } = await sesionCorredor();
  if (!corredor) {
    // El superadministrador sin corredor propio va directo a su pantalla.
    if (await esSuperadmin(usuario.email)) redirect("/admin");
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
  // Y las visitas de hoy por hacer (solo el número, con el índice de citas por corredor e inicio): van en Agenda.
  const hoy = limitesDia(new Date(), corredor.zona_horaria || "America/Costa_Rica");
  const [{ data: borradores }, { data: escaladas }, { count: visitasHoy, error: errorVisitas }, superadmin] = await Promise.all([
    supabase.from("mensajes").select("conversacion_id").eq("corredor_id", corredor.id).eq("estado_borrador", "pendiente"),
    supabase.from("conversaciones").select("id").eq("corredor_id", corredor.id).eq("estado", "escalada"),
    supabase
      .from("citas")
      .select("id", { count: "exact", head: true })
      .eq("corredor_id", corredor.id)
      .in("estado", ["agendada", "confirmada"])
      .gte("inicio", hoy.desde.toISOString())
      .lt("inicio", hoy.hasta.toISOString()),
    esSuperadmin(usuario.email),
  ]);
  // Logo del corredor para el menú: una URL tal cual, o el archivo de marcas/ servido por /marca/<slug>/logo.
  const logoMarca = corredor.marca?.logoSobreProfundo ?? null;
  let logo: string | null = null;
  if (logoMarca && /^https:\/\//.test(logoMarca)) logo = logoMarca;
  else if (logoMarca) {
    const { data: fila } = await supabase.from("corredores").select("slug").eq("id", corredor.id).maybeSingle();
    if (fila?.slug) logo = `/marca/${fila.slug as string}/logo`;
  }
  const teNecesitan = new Set([
    ...(borradores ?? []).map((b) => b.conversacion_id as string),
    ...(escaladas ?? []).map((c) => c.id as string),
  ]).size;

  // El panel se ve como WhatsApp (claro, con su verde): lo que la corredora ya usa todos los días. La
  // marca del corredor queda en la entrada, las fichas y el menú de la izquierda (oscuro, con sus colores).
  return (
    <div className="marco tema">
      {corredor.activo === false && (
        <p className="banda-demo" role="note">
          Estás en la demo: casas y clientes de prueba. Nada se manda por WhatsApp.
        </p>
      )}
      <main className="panel">{children}</main>
      <Navegacion teNecesitan={teNecesitan} />
      <MenuLateral
        teNecesitan={teNecesitan}
        visitasHoy={errorVisitas ? null : (visitasHoy ?? 0)}
        marca={corredor.nombre}
        logo={logo}
        fondoLogo={corredor.marca?.fondoLogo ?? corredor.marca?.colores?.profundo ?? null}
        demo={corredor.activo === false}
        correo={usuario.email ?? ""}
        nombre={corredor.nombre_contacto ?? ""}
        asistente={corredor.nombre_asistente ?? "Patty"}
        superadmin={superadmin}
        colores={variablesMenu(coloresMenu(corredor.marca?.colores))}
      />
      <Patty nombre={corredor.nombre_asistente ?? "Patty"} corredor={corredor.id} />
    </div>
  );
}
