import { pedirEnlace } from "./acciones";

const AVISOS: Record<string, string> = {
  enviado: "Si tu correo tiene acceso, te llegó un enlace para entrar. Ábrelo desde este teléfono.",
  correo: "Revisa el correo: parece incompleto.",
  enlace: "El enlace venció o ya se usó. Pide uno nuevo.",
};

export default async function Entrar({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  return (
    <main className="entrar">
      <h1>Tu asistente</h1>
      <p className="suave">Te mandamos un enlace a tu correo para entrar, sin contraseña.</p>
      {aviso && AVISOS[aviso] && <p className="aviso">{AVISOS[aviso]}</p>}
      <form action={pedirEnlace} className="pila">
        <label htmlFor="correo">Correo</label>
        <input id="correo" name="correo" type="email" autoComplete="email" inputMode="email" required />
        <button type="submit" className="primario">
          Enviarme el enlace
        </button>
      </form>
    </main>
  );
}
