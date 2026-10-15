// Da acceso al panel: crea el usuario de Supabase Auth (si no existe) y lo enlaza a un corredor.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/dar-acceso.mts <correo> <slug-del-corredor> [corredor|soporte]
import { createClient } from "@supabase/supabase-js";

const [correo, slug, rol = "corredor"] = process.argv.slice(2);
if (!correo || !slug || !["corredor", "soporte"].includes(rol)) {
  console.error("Uso: npx tsx scripts/dar-acceso.mts <correo> <slug-del-corredor> [corredor|soporte]");
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: corredor, error: e1 } = await db.from("corredores").select("id, nombre").eq("slug", slug).single();
if (e1 || !corredor) throw new Error(`No existe el corredor ${slug}`);

const creado = await db.auth.admin.createUser({ email: correo, email_confirm: true });
let usuarioId = creado.data.user?.id;
if (!usuarioId) {
  // Ya existía: se busca en la lista de usuarios.
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  usuarioId = data.users.find((u) => u.email?.toLowerCase() === correo.toLowerCase())?.id;
}
if (!usuarioId) throw new Error(`No se pudo crear ni encontrar el usuario ${correo}`);

const { error: e2 } = await db
  .from("miembros")
  .upsert({ corredor_id: corredor.id, user_id: usuarioId, rol }, { onConflict: "corredor_id,user_id" });
if (e2) throw new Error(e2.message);
console.log(`${correo} tiene acceso a ${corredor.nombre} (${rol}). Entra en /entrar con ese correo.`);
