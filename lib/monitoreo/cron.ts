import type { NextRequest } from "next/server";
import { alertar, esperarAlertas } from "../asistente/dependencias";
import { errorSeguro } from "./errores";

/** Verifica el secreto de Vercel Cron y avisa a soporte si la tarea falla. */
export async function tareaProgramada(req: NextRequest, nombre: string, tarea: () => Promise<unknown>) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 });
  }
  try {
    const resultado = await tarea();
    const fallidos = (resultado as { fallidos?: number } | null)?.fallidos;
    if (fallidos) alertar(`cron_${nombre}`, `La tarea ${nombre} terminó con ${fallidos} fallas`);
    return Response.json(resultado);
  } catch (error) {
    console.error(JSON.stringify({ evento: "error_cron", tarea: nombre, error: errorSeguro(error) }));
    alertar(`cron_${nombre}`, `La tarea ${nombre} falló: ${errorSeguro(error)}`);
    return new Response("Error", { status: 500 });
  } finally {
    await esperarAlertas();
  }
}
