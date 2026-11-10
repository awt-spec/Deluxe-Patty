import Link from "next/link";
import { cargarCorredores, llavesWhatsApp } from "@/lib/admin/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { Cifra, Insignia, Mensaje, hace, usd } from "./ui";

// Resumen: lo primero que se ve. Cifras del mes, lo que pide atención (lo que falta o se está pasando) y las
// últimas alertas de monitoreo.

type Atencion = { tono: "rojo" | "ambar" | "gris"; texto: string; href: string };

export default async function Resumen({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string }> }) {
  const { m, ok } = await searchParams;
  const db = createAdminClient();
  const [{ filas }, { data: alertas }] = await Promise.all([
    cargarCorredores(db),
    db.from("alertas").select("clave, enviada_at").order("enviada_at", { ascending: false }).limit(8),
  ]);
  const llaves = llavesWhatsApp();

  const activos = filas.filter((f) => f.c.activo);
  const totalHoy = filas.reduce((s, f) => s + f.gastoHoy, 0);
  const totalMes = filas.reduce((s, f) => s + f.gastoMes, 0);
  const mensajesMes = filas.reduce((s, f) => s + f.mensajesMes, 0);
  const frenados = filas.filter((f) => f.gastoHoy >= f.topeDia || f.gastoMes >= f.topeMes).length;

  // Lo que pide atención, de lo más grave a lo informativo.
  const atencion: Atencion[] = [];
  if (!llaves.token) atencion.push({ tono: "rojo", texto: "Falta WHATSAPP_ACCESS_TOKEN en Vercel: nada puede salir por WhatsApp.", href: "/admin/whatsapp" });
  if (!llaves.secreto) atencion.push({ tono: "rojo", texto: "Falta WHATSAPP_APP_SECRET en Vercel: el webhook rechaza todo lo que llega.", href: "/admin/whatsapp" });
  if (!llaves.verificacion) atencion.push({ tono: "rojo", texto: "Falta WHATSAPP_VERIFY_TOKEN en Vercel: Meta no puede verificar el webhook.", href: "/admin/whatsapp" });
  for (const f of activos) {
    const ruta = `/admin/corredores/${f.c.id}`;
    if (!f.c.whatsapp_phone_number_id) atencion.push({ tono: "rojo", texto: `${f.c.nombre}: no tiene número de WhatsApp conectado (Phone number ID).`, href: ruta });
    else if (!f.ultimoEntrante) atencion.push({ tono: "ambar", texto: `${f.c.nombre}: todavía no ha entrado ningún mensaje por WhatsApp. Revisa la conexión.`, href: "/admin/whatsapp" });
    if (!f.c.whatsapp_corredor) atencion.push({ tono: "ambar", texto: `${f.c.nombre}: falta el celular del corredor. Sin él no recibe el plan del día ni los avisos, y sus mensajes se tratan como de un cliente.`, href: ruta });
    if (f.gastoHoy >= f.topeDia || f.gastoMes >= f.topeMes) atencion.push({ tono: "rojo", texto: `${f.c.nombre}: frenado por tope de gasto de IA.`, href: ruta });
    else if (f.gastoHoy >= f.topeDia * 0.8 || f.gastoMes >= f.topeMes * 0.8) atencion.push({ tono: "ambar", texto: `${f.c.nombre}: cerca del tope de gasto de IA.`, href: ruta });
    if (f.mensajesMes >= f.c.aviso_mensajes_mes) atencion.push({ tono: "ambar", texto: `${f.c.nombre}: ${f.mensajesMes} de ${f.c.tope_mensajes_mes} mensajes del mes.`, href: ruta });
    if (!f.c.respuesta_automatica) atencion.push({ tono: "gris", texto: `${f.c.nombre}: en piloto en sombra (las respuestas esperan su aprobación).`, href: ruta });
  }
  const orden = { rojo: 0, ambar: 1, gris: 2 } as const;
  atencion.sort((a, b) => orden[a.tono] - orden[b.tono]);

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <header className="adm-encabezado">
        <h1>Resumen</h1>
        <p>Cómo va la plataforma hoy.</p>
      </header>

      <div className="adm-cifras">
        <Cifra valor={activos.length} etiqueta={activos.length === 1 ? "corredor activo" : "corredores activos"} />
        <Cifra valor={mensajesMes.toLocaleString("es-CR")} etiqueta="mensajes este mes" />
        <Cifra valor={usd(totalHoy)} etiqueta="gasto de IA hoy" />
        <Cifra valor={usd(totalMes)} etiqueta="gasto de IA este mes" />
        <Cifra valor={frenados} etiqueta={frenados === 1 ? "corredor frenado" : "corredores frenados"} tono={frenados ? "alerta" : undefined} />
      </div>

      <section className="adm-seccion">
        <h2>Atención</h2>
        {atencion.length === 0 ? (
          <p className="adm-vacio">Todo en orden. No hay nada pendiente.</p>
        ) : (
          <ul className="adm-lista">
            {atencion.map((a, i) => (
              <li key={i}>
                <Insignia tono={a.tono}>{a.tono === "rojo" ? "Urgente" : a.tono === "ambar" ? "Revisar" : "Info"}</Insignia>
                <span>{a.texto}</span>
                <Link href={a.href} className="adm-enlace">
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="adm-seccion">
        <h2>Corredores</h2>
        <div className="adm-scroll">
          <table className="adm-tabla">
            <thead>
              <tr>
                <th>Corredor</th>
                <th>WhatsApp</th>
                <th>Último mensaje</th>
                <th>Mensajes del mes</th>
                <th>IA hoy</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.c.id}>
                  <td data-etiqueta="Corredor">
                    <Link href={`/admin/corredores/${f.c.id}`} className="adm-enlace fuerte">
                      {f.c.nombre}
                    </Link>{" "}
                    {!f.c.activo && <Insignia>Demo</Insignia>}
                  </td>
                  <td data-etiqueta="WhatsApp">{f.c.whatsapp_phone_number_id ? <Insignia tono="verde">Conectado</Insignia> : <Insignia tono="rojo">Sin número</Insignia>}</td>
                  <td data-etiqueta="Último mensaje">{hace(f.ultimoEntrante)}</td>
                  <td data-etiqueta="Mensajes del mes">
                    <span className="adm-valor">
                      {f.mensajesMes} <span className="adm-suave">de {f.c.tope_mensajes_mes}</span>
                    </span>
                  </td>
                  <td data-etiqueta="IA hoy">
                    <span className="adm-valor">
                      {usd(f.gastoHoy)} <span className="adm-suave">de {usd(f.topeDia)}</span>
                    </span>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="adm-vacio">
                    Todavía no hay corredores.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adm-seccion">
        <h2>Alertas recientes</h2>
        {(alertas ?? []).length === 0 ? (
          <p className="adm-vacio">Sin alertas. El monitoreo no ha tenido que avisar nada.</p>
        ) : (
          <ul className="adm-lista simple">
            {(alertas ?? []).map((a) => (
              <li key={a.clave as string}>
                <code>{String(a.clave).replace(/:\d+$/, "")}</code>
                <span className="adm-suave">{hace(a.enviada_at as string)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
