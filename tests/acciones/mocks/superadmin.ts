import { NoEncontrado, estado } from "../entorno";

// lib/admin/superadmin: quien no es superadmin recibe 404, como en producción.
export async function sesionSuperadmin() {
  if (!estado.superadmin) throw new NoEncontrado();
  return { usuario: { id: "su", email: estado.superadmin }, correo: estado.superadmin };
}
export async function esSuperadmin(correo: string | null | undefined) {
  return !!correo && correo === estado.superadmin;
}
