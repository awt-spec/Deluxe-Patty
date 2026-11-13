// Canal con la página de instalación del panel (/panel/duenos*): lo que la página puede pedirle a la extensión.
// Script clásico (no módulo) porque lo carga Chrome como content script antes de panel.js; con `var` y
// `function` para que inyectarlo dos veces en la misma pestaña no falle. Las mismas reglas, del lado de la
// página, están en lib/panel/extension-instalar.ts (una prueba revisa que los nombres coincidan).

// `var`: script clásico que se puede volver a inyectar en la misma pestaña.
var CANAL = { pagina: "panel-duenos", extension: "buscador-duenos" };

/**
 * Lee un mensaje de la página. Solo se acepta lo que viene de esta misma ventana (no de un iframe ni de otra
 * pestaña) y del origen del panel, con la forma exacta: "hola" o "conectar" con un código de un solo uso.
 * Todo lo demás se ignora (null).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- la usa panel.js (mismo mundo aislado)
function validarDePagina(evento, ventana, origen) {
  if (!evento || evento.source !== ventana || evento.origin !== origen) return null;
  const d = evento.data;
  if (!d || typeof d !== "object" || Array.isArray(d) || d.fuente !== CANAL.pagina) return null;
  if (d.tipo === "hola") return { tipo: "hola" };
  if (d.tipo === "conectar") {
    if (typeof d.codigo !== "string" || !/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(d.codigo)) return null;
    if (typeof d.pedido !== "string" || !/^[a-z0-9-]{1,40}$/.test(d.pedido)) return null;
    return { tipo: "conectar", codigo: d.codigo, pedido: d.pedido };
  }
  return null;
}
