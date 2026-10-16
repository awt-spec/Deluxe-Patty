// Descripción de un error apta para registros y alertas (Ley 8968): tipo, operación y código, nunca el
// mensaje completo, que puede traer teléfonos, nombres o texto de clientes (por ejemplo, un error de
// Postgres que repite el valor que falló).

export class ErrorDatos extends Error {
  constructor(
    readonly operacion: string,
    readonly codigo: string | undefined,
    mensaje: string,
  ) {
    super(`${operacion}: ${codigo ?? ""} ${mensaje}`);
    this.name = "ErrorDatos";
  }
}

export function errorSeguro(error: unknown): string {
  if (!(error instanceof Error)) return "desconocido";
  const e = error as Error & { operacion?: unknown; codigo?: unknown; code?: unknown; status?: unknown };
  return [
    e.name,
    typeof e.operacion === "string" ? e.operacion : null,
    ["string", "number"].includes(typeof e.codigo) ? `código ${e.codigo}` : null,
    ["string", "number"].includes(typeof e.code) ? `código ${e.code}` : null,
    typeof e.status === "number" ? `estado ${e.status}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
