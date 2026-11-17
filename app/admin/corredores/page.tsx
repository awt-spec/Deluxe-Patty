import { cargarCorredores } from "@/lib/admin/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { Mensaje } from "../ui";
import { VistaCorredores } from "../vistas/corredores";

export default async function Corredores({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string }> }) {
  const { m, ok } = await searchParams;
  const { filas } = await cargarCorredores(createAdminClient());
  return (
    <>
      <Mensaje m={m} ok={ok} />
      <VistaCorredores filas={filas} />
    </>
  );
}
