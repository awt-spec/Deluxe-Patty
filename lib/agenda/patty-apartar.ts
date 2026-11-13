import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dependencias } from "../asistente/contexto";
import type { Corredor } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";
import { choquesConVisitas, empacarPropuesta } from "./apartar-ia";
import { AYUDA_BLOQUEO } from "./bloquear";
import { entenderPedidoApartado } from "./entender-apartado";
import { conPunto, horaCorta } from "./formato";

// "Apartar tiempo" desde el chat de Patty cuando el código no lo entiende solo: Haiku lo entiende, el código lo
// revisa y Patty contesta con lo que entendió (texto armado aquí) y un botón a la pantalla Apartar tiempo con la
// propuesta en el enlace; allá sale la tarjeta "Esto entendí" y nada se guarda hasta tocar "Sí, apartarlo".

const PEDIDOS_POR_MINUTO = 6;

/** Hasta 6 pedidos con IA por minuto y corredor (reclamar_alerta, atómico en la base). Si la base falla, no frena. */
export async function hayTurnoApartar(db: Pick<SupabaseClient, "rpc">, corredorId: string): Promise<boolean> {
  try {
    for (let i = 0; i < PEDIDOS_POR_MINUTO; i++) {
      const { data, error } = await db.rpc("reclamar_alerta", { p_clave: `apartar_ia:${corredorId}:${i}`, p_minutos: 1 });
      if (error) throw new Error(error.message);
      if (data === true) return true;
    }
    return false;
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_freno_apartar", corredorId, error: errorSeguro(e) }));
    return true;
  }
}

export async function apartarConPatty(
  deps: Pick<Dependencias, "repo" | "cerebro">,
  db: Pick<SupabaseClient, "rpc">,
  corredor: Corredor,
  texto: string,
  ahora = new Date(),
): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
  const r = await entenderPedidoApartado(deps, corredor, texto, ahora, { turno: () => hayTurnoApartar(db, corredor.id) });
  if (!r.ok) return { ok: false, motivo: r.motivo };
  const { apartados, quitar, dudas, notas } = r.revisado;
  const enlace = `/panel/agenda/bloquear?p=${empacarPropuesta(r.texto, r.ops)}`;
  const aviso = r.aviso ? `${r.aviso}\n\n` : "";
  if (!apartados.length && !quitar.length && !dudas.length) {
    return { ok: true, texto: `${aviso}No entendí qué día. ${[...notas, AYUDA_BLOQUEO].join(" ")}` };
  }
  let choques: string[] = [];
  if (apartados.length) {
    try {
      const fin = apartados.reduce((m, a) => (a.fin > m ? a.fin : m), apartados[0].fin);
      const { citas } = await deps.repo.datosAgenda(corredor.id, new Date(apartados[0].inicio), new Date(fin));
      const c = choquesConVisitas(apartados, citas);
      choques = apartados.filter((a) => c[a.clave]).flatMap((a) => c[a.clave].map((v) => conPunto(`${a.texto.split(" · ")[0]}: tienes una visita a las ${horaCorta(new Date(v.inicio), corredor.zona_horaria)}`)));
    } catch (e) {
      console.error(JSON.stringify({ evento: "error_patty_apartar_choques", corredorId: corredor.id, error: errorSeguro(e) }));
    }
  }
  const partes = [
    aviso.trim() || null,
    apartados.length ? `Esto entendí:\n\n${apartados.map((a) => `- ${a.texto}`).join("\n")}` : null,
    quitar.length ? `Quitaría lo apartado:\n\n${quitar.map((q) => `- ${q.texto}`).join("\n")}` : null,
    dudas.length ? `Antes de apartarlo: ${dudas.map((d) => d.pregunta).join(" ")}` : null,
    choques.length ? `Ojo: ${choques.join(" ")} La visita sigue en pie.` : null,
    ...notas,
    `Todavía no lo aparté. ${dudas.length ? "Contéstame la duda" : "Revísalo y confírmalo"} aquí:\n\n[Revisar y apartar](${enlace})`,
  ];
  return { ok: true, texto: partes.filter(Boolean).join("\n\n") };
}
