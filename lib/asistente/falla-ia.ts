import Anthropic from "@anthropic-ai/sdk";

// Por qué falló una llamada a Claude, en categorías que el código entiende y palabras que el corredor entiende.
// Lo de configuración (sin llave, llave inválida, sin saldo, modelo o permiso) no se arregla reintentando: se le dice
// al corredor que avise a soporte y soporte recibe una alerta "error_ia_config" (solo la causa y el código, nunca el
// mensaje del error ni datos de clientes, Ley 8968).

export type CausaFallaIA =
  | "sin_llave"
  | "llave_invalida"
  | "sin_saldo"
  | "sin_permiso"
  | "modelo"
  | "ocupada"
  | "pasajera"
  | "otra";

const CONFIGURACION: ReadonlySet<CausaFallaIA> = new Set(["sin_llave", "llave_invalida", "sin_saldo", "sin_permiso", "modelo"]);

/** Lo que no se arregla solo: hay que tocar la llave, el saldo o el modelo en Vercel o en la consola de Anthropic. */
export function esFallaDeConfiguracion(causa: CausaFallaIA): boolean {
  return CONFIGURACION.has(causa);
}

/** El SDK sin credenciales falla al pedir, no al crearse: "Could not resolve authentication method…". */
const SIN_CREDENCIALES = /could not resolve authentication method|api[_ ]?key.*(missing|empty)/i;
/** La API contesta 400 cuando a la cuenta no le queda saldo. */
const SIN_SALDO = /credit balance|billing|saldo/i;

function mensajeDeApi(e: InstanceType<typeof Anthropic.APIError>): string {
  const cuerpo = e.error as { error?: { message?: unknown } } | undefined;
  return typeof cuerpo?.error?.message === "string" ? cuerpo.error.message : e.message;
}

export function causaFallaIA(error: unknown): CausaFallaIA {
  if (error instanceof Anthropic.AuthenticationError) return "llave_invalida";
  if (error instanceof Anthropic.PermissionDeniedError) return "sin_permiso";
  if (error instanceof Anthropic.NotFoundError) return "modelo";
  if (error instanceof Anthropic.RateLimitError) return "ocupada";
  if (error instanceof Anthropic.BadRequestError) return SIN_SALDO.test(mensajeDeApi(error)) ? "sin_saldo" : "otra";
  if (error instanceof Anthropic.APIConnectionError) return "pasajera";
  if (error instanceof Anthropic.APIError) {
    if (error.status === 529) return "ocupada";
    if (typeof error.status === "number" && error.status >= 500) return "pasajera";
    return "otra";
  }
  if (error instanceof Error && SIN_CREDENCIALES.test(error.message)) return "sin_llave";
  return "otra";
}

/** Código HTTP de la falla, si lo hay (va a los registros; el mensaje no). */
export function estadoFallaIA(error: unknown): number | null {
  return error instanceof Anthropic.APIError && typeof error.status === "number" ? error.status : null;
}

/** Lo que ve el corredor, con sus palabras. */
export function mensajeFallaIA(causa: CausaFallaIA, nombre?: string | null): string {
  const n = (nombre ?? "").trim() || "Patty";
  if (esFallaDeConfiguracion(causa)) return `Falta configurar la IA de ${n}: avisa a soporte. Ya les dejé el aviso.`;
  if (causa === "ocupada") return `${n} está muy ocupada en este momento. Inténtalo de nuevo en un minuto.`;
  return "No pude contestar ahora. Inténtalo de nuevo en un momento.";
}

/** Texto corto para la alerta a soporte: causa y código, sin datos del corredor ni de clientes. */
export function detalleFallaIA(causa: CausaFallaIA, estado: number | null): string {
  const que: Record<CausaFallaIA, string> = {
    sin_llave: "falta ANTHROPIC_API_KEY en el servidor",
    llave_invalida: "Anthropic rechazó la llave (401): revisa ANTHROPIC_API_KEY en Vercel",
    sin_saldo: "la cuenta de Anthropic no tiene saldo",
    sin_permiso: "la llave no tiene permiso (403)",
    modelo: "el modelo no existe o la cuenta no tiene acceso (404)",
    ocupada: "Anthropic está saturado o hay límite de velocidad",
    pasajera: "Anthropic no respondió (red o 5xx)",
    otra: "falla de la IA",
  };
  return `${que[causa]}${estado && !que[causa].includes(String(estado)) ? ` (estado ${estado})` : ""}`;
}

/**
 * Deja la falla en los registros y, si es de configuración, la alerta a soporte con el evento "error_ia_config"
 * (`registrar` de las dependencias alerta todo lo que empieza con "error_"). Devuelve la causa.
 */
export function registrarFallaIA(
  registrar: ((evento: string, datos: Record<string, unknown>) => void) | undefined,
  datos: { corredorId: string; donde: string },
  error: unknown,
): CausaFallaIA {
  const causa = causaFallaIA(error);
  const estado = estadoFallaIA(error);
  if (esFallaDeConfiguracion(causa)) {
    registrar?.("error_ia_config", { ...datos, causa, ...(estado ? { codigo: estado } : {}), detalle: detalleFallaIA(causa, estado) });
  }
  return causa;
}
