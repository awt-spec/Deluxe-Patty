import { notFound } from "next/navigation";
import { cargarCorredores } from "@/lib/admin/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { Mensaje } from "../../ui";
import { VistaCorredor } from "../../vistas/corredor";

export default async function CorredorDetalle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { m, ok } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createAdminClient();
  const { filas, plataforma } = await cargarCorredores(db, id);
  const f = filas[0];
  if (!f) notFound();

  // Quién tiene acceso a este corredor (correo desde Supabase Auth).
  const [{ data: miembros }, { data: usuarios }] = await Promise.all([
    db.from("miembros").select("user_id, rol, created_at").eq("corredor_id", id),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const correoDe = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? "(sin correo)"]));

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <VistaCorredor
        fila={f}
        plataforma={plataforma}
        miembros={(miembros ?? []).map((mi) => ({ user_id: mi.user_id as string, rol: String(mi.rol), correo: correoDe.get(mi.user_id as string) ?? null }))}
      />
    </>
  );
}
