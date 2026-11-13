import { RechazoModelo, type Cerebro } from "../asistente/cerebro";
import type { Consumo } from "../asistente/costo";
import { hayPresupuestoHoy } from "../asistente/limites";
import type { Repositorio } from "../datos/repositorio";
import type { Corredor } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";
import {
  codigoLoEntiende,
  contextoFechas,
  interpretarApartadoDemo,
  MAX_PEDIDO_APARTAR,
  operacionDeCodigo,
  revisarOperaciones,
  textoLimpio,
  type OperacionApartarCruda,
  type Revisado,
} from "./apartar-ia";
import { entenderBloqueo } from "./bloquear";

// Un solo camino para entender "apartar tiempo" en la pantalla, en el chat de Patty y por WhatsApp:
// 1) si el código lo entiende entero, gratis e instantáneo; 2) en la demo (corredor inactivo), el intérprete de la
// demo, sin gastar; 3) sin presupuesto de IA (o sin el método), lo que alcance a entender el código y el aviso
// "Hoy solo entiendo frases simples"; 4) si no, Haiku. Siempre termina en revisarOperaciones. Nada del texto va a
// los registros.

export type FuenteApartado = "codigo" | "demo" | "ia" | "simple";

export interface Entendido {
  ok: true;
  fuente: FuenteApartado;
  texto: string;
  /** Las operaciones sin revisar (para pasarlas por un enlace a la pantalla y volver a revisarlas allá). */
  ops: OperacionApartarCruda[];
  revisado: Revisado;
  aviso: string | null;
}

export const SOLO_SIMPLES = "Hoy solo entiendo frases simples, como «el martes de 2 a 4» o «mañana en la tarde».";
export const MUY_RAPIDO = "Vas muy rápido: espera un minuto y vuelve a decírmelo.";

export async function entenderPedidoApartado(
  deps: { repo: Pick<Repositorio, "presupuestoIA" | "registrarUso" | "datosAgenda">; cerebro: Pick<Cerebro, "entenderApartado"> },
  corredor: Corredor,
  textoCrudo: string,
  ahora: Date,
  opciones: {
    /** Freno de pedidos por minuto (reclamar_alerta); se pregunta solo antes de llamar al modelo. */
    turno?: () => Promise<boolean>;
    /** Cómo se suma el costo (por WhatsApp va por el contexto del mensaje). */
    usoClaude?: (c: Consumo) => Promise<void>;
    horarios?: { dia_semana: number; hora_inicio: string; hora_fin: string }[];
  } = {},
): Promise<Entendido | { ok: false; motivo: string }> {
  const zona = corredor.zona_horaria;
  const texto = textoLimpio(textoCrudo, MAX_PEDIDO_APARTAR);
  if (!texto) return { ok: false, motivo: "Cuéntame cuándo no puedes." };
  const listo = (fuente: FuenteApartado, ops: OperacionApartarCruda[], aviso: string | null = null): Entendido => ({
    ok: true,
    fuente,
    texto,
    ops,
    revisado: revisarOperaciones(ops, { ahora, zona, texto }),
    aviso,
  });

  const entero = codigoLoEntiende(texto, ahora, zona);
  if (entero) return listo("codigo", [operacionDeCodigo(entero)]);
  if (corredor.activo === false) return listo("demo", interpretarApartadoDemo(texto, ahora, zona));

  // Lo que alcance a leer el código (una parte), con el aviso.
  const simple = (aviso: string) => {
    const parte = entenderBloqueo(/^\s*(?:apart|bloque)/i.test(texto) ? texto : `apartar ${texto}`, ahora, zona);
    return listo("simple", parte ? [operacionDeCodigo(parte)] : [], aviso);
  };
  if (!deps.cerebro.entenderApartado) return simple(SOLO_SIMPLES);
  if (!(await hayPresupuestoHoy(deps.repo, corredor))) return simple(SOLO_SIMPLES);
  if (opciones.turno && !(await opciones.turno())) return { ok: false, motivo: MUY_RAPIDO };

  const usoClaude =
    opciones.usoClaude ??
    ((c: Consumo) =>
      deps.repo
        .registrarUso(corredor.id, { llamadasClaude: 1, tokensEntrada: c.tokensEntrada, tokensSalida: c.tokensSalida, costoClaudeUsd: c.costoUsd })
        .then(() => undefined));
  try {
    const horarios = opciones.horarios ?? (await deps.repo.datosAgenda(corredor.id, ahora, new Date(ahora.getTime() + 60_000))).horarios;
    const r = await deps.cerebro.entenderApartado(corredor, { texto, contexto: contextoFechas(ahora, zona, horarios) });
    await usoClaude(r.consumo);
    return listo("ia", r.operaciones);
  } catch (e) {
    if (e instanceof RechazoModelo) await usoClaude(e.consumo);
    console.error(JSON.stringify({ evento: "error_apartar_ia", corredorId: corredor.id, error: errorSeguro(e) }));
    return simple("No pude usar la inteligencia artificial ahora. " + SOLO_SIMPLES);
  }
}
