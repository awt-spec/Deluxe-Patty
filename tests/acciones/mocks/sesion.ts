import { Redireccion, estado } from "../entorno";

// lib/panel/sesion: la sesión del corredor la arma cada prueba en `estado.sesion`. Sin sesión, a /entrar.
export const COOKIE_CORREDOR = "corredor";
export async function sesionConCorredor() {
  if (!estado.sesion) throw new Redireccion("/entrar");
  return estado.sesion;
}
export async function sesionCorredor() {
  if (!estado.sesion) throw new Redireccion("/entrar");
  return { ...estado.sesion, corredores: [estado.sesion.corredor] };
}
