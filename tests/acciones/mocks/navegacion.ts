import { NoEncontrado, Redireccion } from "../entorno";

// next/navigation: en Next, redirect y notFound cortan la acción lanzando; aquí también.
export function redirect(url: string): never {
  throw new Redireccion(url);
}
export function notFound(): never {
  throw new NoEncontrado();
}
