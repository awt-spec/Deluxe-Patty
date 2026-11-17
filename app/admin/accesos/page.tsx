import { sesionSuperadmin } from "@/lib/admin/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Mensaje } from "../ui";
import { VistaAccesos } from "../vistas/accesos";

// Accesos: quién puede entrar, a qué corredor y quién es superadministrador. Todo se hace aquí, sin entrar a Supabase.

export default async function Accesos({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string }> }) {
  const { correo: yo } = await sesionSuperadmin();
  const { m, ok } = await searchParams;
  const db = createAdminClient();
  const [{ data: lista }, { data: miembros }, { data: corredores }, { data: supers }] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("miembros").select("user_id, corredor_id, rol"),
    db.from("corredores").select("id, nombre").order("nombre"),
    db.from("superadmins").select("correo"),
  ]);
  const nombreCorredor = new Map((corredores ?? []).map((c) => [c.id as string, c.nombre as string]));
  const esSuper = new Set((supers ?? []).map((s) => String(s.correo).toLowerCase()));
  const usuarios = [...(lista?.users ?? [])]
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""))
    .map((u) => ({
      id: u.id,
      correo: u.email ?? "",
      ultimoIngreso: u.last_sign_in_at ?? null,
      superadmin: esSuper.has((u.email ?? "").toLowerCase()),
      accesos: (miembros ?? [])
        .filter((x) => x.user_id === u.id)
        .map((x) => ({ corredor_id: x.corredor_id as string, corredor: nombreCorredor.get(x.corredor_id as string) ?? "Corredor", rol: String(x.rol) })),
    }));

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <VistaAccesos yo={yo} usuarios={usuarios} totalSuper={esSuper.size} corredores={(corredores ?? []).map((c) => ({ id: c.id as string, nombre: c.nombre as string }))} />
    </>
  );
}
