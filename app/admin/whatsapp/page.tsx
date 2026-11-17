import { sesionSuperadmin } from "@/lib/admin/superadmin";
import { cargarCorredores, llavesWhatsApp } from "@/lib/admin/datos";
import { urlWebhook } from "@/lib/admin/urls";
import { createAdminClient } from "@/lib/supabase/admin";
import { appsSuscritas, estadoNumero } from "@/lib/whatsapp/graph";
import { Mensaje } from "../ui";
import { VistaWhatsApp } from "../vistas/whatsapp";

// Diagnóstico de la conexión con Meta, en vivo: llaves del servidor, estado de cada número y suscripción de la app.
// Aquí se resuelven los tres bloqueos de la puesta en marcha: número sin registrar (133010), app sin suscribir a la
// cuenta y webhook sin conectar. Las llaves nunca se muestran: solo si existen. Lo que se ve está en vistas/whatsapp.tsx.

export default async function WhatsApp({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string; waba?: string }> }) {
  // Cada página comprueba al superadmin por su cuenta (no solo el layout): sin serlo, 404.
  await sesionSuperadmin();
  const { m, ok, waba } = await searchParams;
  const llaves = llavesWhatsApp();
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const webhook = await urlWebhook();
  const { filas } = await cargarCorredores(createAdminClient());
  const conectables = filas.filter((f) => f.c.activo && f.c.whatsapp_phone_number_id);

  // Estado de cada número en Meta (en paralelo, con tope de 8 s cada llamada).
  const estados = await Promise.all(conectables.map((f) => (token ? estadoNumero(token, f.c.whatsapp_phone_number_id!) : Promise.resolve(null))));
  const wabaValido = waba && /^\d{5,25}$/.test(waba) ? waba : null;
  const apps = token && wabaValido ? await appsSuscritas(token, wabaValido) : null;

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <VistaWhatsApp llaves={llaves} webhook={webhook} conectables={conectables} estados={estados} wabaValido={wabaValido} apps={apps} hayToken={!!token} />
    </>
  );
}
