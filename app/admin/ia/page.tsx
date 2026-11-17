import { cargarCorredores } from "@/lib/admin/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { Mensaje } from "../ui";
import { VistaIA } from "../vistas/ia";

// IA y topes: cuánto gasta cada corredor (Claude + imágenes de OpenAI + audio) y los topes de la plataforma, que valen
// para todo corredor que no tenga uno propio. Al llegar al tope la IA deja de responder: el chat queda para el
// corredor y no se generan imágenes hasta el día o el mes siguiente. Lo que se ve está en vistas/ia.tsx.

export default async function IA({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string }> }) {
  const { m, ok } = await searchParams;
  const { filas, plataforma } = await cargarCorredores(createAdminClient());
  return (
    <>
      <Mensaje m={m} ok={ok} />
      <VistaIA filas={filas} plataforma={plataforma} />
    </>
  );
}
