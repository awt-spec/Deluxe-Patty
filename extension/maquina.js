// Estados de la búsqueda de dueños y lo que se le puede pedir en cada uno. Reglas puras (sin chrome.*): las prueba
// tests/maquina-extension.test.ts y las usa background.js.
//
//   lista ─iniciar→ buscando ─pausar→ pausada ─seguir→ buscando
//                   buscando ─verificacion→ verificacion ─seguir→ buscando
//   buscando | pausada | verificacion ─detener→ revisando (detenida: se revisa y guarda lo ya leído)
//   buscando ─revisar→ revisando ─terminar→ terminada (o detenida)
//   cualquiera activa ─fallar→ error
// "terminada", "detenida" y "error" son de reposo, como "lista": desde ahí se puede volver a empezar.

export const FASES = ["lista", "buscando", "pausada", "verificacion", "revisando", "terminada", "detenida", "error"];
/** Mientras está en una de estas, hay una búsqueda en curso (no se empieza otra). */
export const ACTIVAS = ["buscando", "pausada", "verificacion", "revisando"];
const REPOSO = ["lista", "terminada", "detenida", "error"];

export const activa = (fase) => ACTIVAS.includes(fase);

/**
 * Aplica un evento. Devuelve el estado nuevo (sin tocar el que recibe) o null si el evento no corresponde en esa
 * fase (por ejemplo, pausar algo que ya terminó): quien llama lo ignora.
 */
export function transicion(estado, evento) {
  const f = estado?.fase ?? "lista";
  const tipo = evento?.tipo;
  const con = (cambios) => ({ ...estado, motivoPausa: null, ...cambios });
  switch (tipo) {
    case "iniciar":
      return REPOSO.includes(f) ? con({ fase: "buscando", detenida: false }) : null;
    case "pausar":
      // La pausa por actividad solo se da buscando: en una verificación la persona está usando la pestaña a propósito.
      return f === "buscando" ? con({ fase: "pausada", motivoPausa: evento.motivo === "actividad" ? "actividad" : "usuario" }) : null;
    case "seguir":
      return f === "pausada" || f === "verificacion" ? con({ fase: "buscando" }) : null;
    case "verificacion":
      return f === "buscando" ? con({ fase: "verificacion" }) : null;
    case "detener":
      return f === "buscando" || f === "pausada" || f === "verificacion" ? con({ fase: "revisando", detenida: true }) : null;
    case "revisar":
      return f === "buscando" ? con({ fase: "revisando" }) : null;
    case "terminar":
      return f === "revisando" ? con({ fase: estado.detenida ? "detenida" : "terminada" }) : null;
    case "fallar":
      return ACTIVAS.includes(f) ? con({ fase: "error" }) : null;
    default:
      return null;
  }
}

/** Qué hace la búsqueda ahora, en palabras de todos los días (para la barra, el popup y el panel). */
export function textoFase(estado) {
  switch (estado?.fase) {
    case "buscando":
      return estado.haciendo || "Buscando…";
    case "pausada":
      return estado.motivoPausa === "actividad" ? "Pausada: parece que quieres usar esta pestaña." : "Pausada.";
    case "verificacion":
      return "Encuentra24 pide que confirmes que eres tú. Resuélvelo y toca Seguir.";
    case "revisando":
      return estado.detenida ? "Detenida. Revisando lo que alcancé a leer…" : "Revisando cuáles son dueños directos…";
    default:
      return estado?.mensaje || "";
  }
}
