import Link from "next/link";
import { cargarCorredores } from "@/lib/admin/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { Barra, Insignia, Mensaje, hace, usd } from "../ui";

export default async function Corredores({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string }> }) {
  const { m, ok } = await searchParams;
  const { filas } = await cargarCorredores(createAdminClient());

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <header className="adm-encabezado">
        <h1>Corredores</h1>
        <p>{filas.length === 1 ? "1 corredor en la plataforma." : `${filas.length} corredores en la plataforma.`} Toca uno para ver y editar sus datos.</p>
      </header>

      <div className="adm-tarjetas">
        {filas.map((f) => (
          <Link key={f.c.id} href={`/admin/corredores/${f.c.id}`} className="adm-tarjeta">
            <span className="adm-tarjeta-titulo">
              <strong>{f.c.nombre}</strong>
              {f.c.activo ? <Insignia tono="verde">Activo</Insignia> : <Insignia>Demo / inactivo</Insignia>}
            </span>
            <span className="adm-datos">
              <span>
                <small>WhatsApp</small>
                {f.c.whatsapp_phone_number_id ? "Conectado" : <em className="adm-rojo">Sin número</em>}
              </span>
              <span>
                <small>Celular del corredor</small>
                {f.c.whatsapp_corredor ? "Guardado" : <em className="adm-ambar">Falta</em>}
              </span>
              <span>
                <small>Respuestas</small>
                {f.c.respuesta_automatica ? "Automáticas" : "Con aprobación"}
              </span>
              <span>
                <small>Último mensaje</small>
                {hace(f.ultimoEntrante)}
              </span>
            </span>
            <span className="adm-uso-fila">
              <span>
                IA hoy <strong>{usd(f.gastoHoy)}</strong> <span className="adm-suave">de {usd(f.topeDia)}</span>
              </span>
              <Barra gasto={f.gastoHoy} tope={f.topeDia} />
              <span>
                Mensajes del mes{" "}
                <strong>
                  {f.mensajesMes} <span className="adm-suave">de {f.c.tope_mensajes_mes}</span>
                </strong>
              </span>
              <Barra gasto={f.mensajesMes} tope={f.c.tope_mensajes_mes} />
            </span>
          </Link>
        ))}
        {filas.length === 0 && <p className="adm-vacio">Todavía no hay corredores.</p>}
      </div>
    </>
  );
}
