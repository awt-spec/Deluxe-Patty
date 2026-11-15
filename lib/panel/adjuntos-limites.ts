// Cuánto se le puede mandar a Patty en un mensaje. Un solo lugar para el número y para lo que se le dice al corredor:
// antes el chat cortaba en 2,8 MB y los mensajes (y la documentación) decían 4 MB.
//
// Los archivos viajan en base64 dentro de la acción del servidor (4/3 de su tamaño) y Vercel no deja pasar más de
// 4,5 MB por pedido; el servidor acepta hasta 4 MiB de base64 como margen. Para el corredor el límite es de 2,8 MB de
// archivos entre todos (ya achicadas las fotos), y un PDF solo tampoco puede pasar de eso.

export const MAX_ARCHIVOS_PATTY = 10;
/** Bytes reales de archivos por mensaje (y de un PDF). */
export const MAX_BYTES_PATTY = 2_800_000;
/** Lo mismo, contado en base64 (lo que de verdad viaja). */
export const MAX_BASE64_PATTY = Math.ceil((MAX_BYTES_PATTY * 4) / 3);
/** El número como lo lee el corredor. */
export const TEXTO_MAX_PATTY = "2,8 MB";
