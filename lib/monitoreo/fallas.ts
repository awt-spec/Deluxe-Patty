// Fallas que no deben cortar el flujo (la agenda sigue, la visita se guarda) pero tampoco pueden pasar en
// silencio: quedan en el registro y avisan a soporte (una por clave y hora, como las demás alertas).
// El avisador lo pone `lib/asistente/dependencias.ts` al cargarse; sin él (pruebas, scripts) solo queda el
// registro. Así los módulos de bajo nivel avisan sin importar las dependencias de producción.
// `error` tiene que venir de errorSeguro(): tipo y código, nunca datos de clientes (Ley 8968).

type Avisador = (clave: string, texto: string) => void;

let avisador: Avisador | null = null;

export function alAvisarFallas(a: Avisador | null) {
  avisador = a;
}

export function reportarFalla(evento: `error_${string}`, datos: { corredorId?: string; error: string }) {
  console.error(JSON.stringify({ evento, ...datos }));
  try {
    avisador?.(`${evento}:${datos.corredorId ?? ""}`, `${evento} (corredor ${datos.corredorId ?? "?"}): ${datos.error}`);
  } catch {
    // Un aviso que falla no puede tumbar lo que lo disparó; el registro de arriba ya quedó.
  }
}
