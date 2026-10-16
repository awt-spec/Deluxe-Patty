import { BotonEnviar } from "@/app/panel/boton-enviar";
import { IconoCorreo } from "@/app/panel/iconos";
import { marcaDeEntrada, slugValido } from "@/lib/panel/marca";
import { pedirEnlace } from "./acciones";
import { OtroEnlace } from "./otro-enlace";
import { PantallaEntrada } from "./pantalla";

const ERRORES: Record<string, string> = {
  correo: "Ese correo parece incompleto. Revísalo y vuelve a intentar.",
  enlace: "Ese enlace ya se usó o venció. Escribe tu correo y te mandamos uno nuevo.",
};

export default async function Entrar({ searchParams }: { searchParams: Promise<{ aviso?: string; c?: string }> }) {
  const { aviso, c } = await searchParams;
  const corredor = slugValido(c) ? c : null;
  const marca = await marcaDeEntrada(corredor);
  const volver = corredor ? `/entrar?c=${corredor}` : "/entrar";

  if (aviso === "enviado") {
    return (
      <PantallaEntrada marca={marca}>
        <div className="sello" aria-hidden>
          <IconoCorreo tamano={30} />
        </div>
        <h1>Revisa tu correo</h1>
        <p>Si tu correo tiene acceso, te llegó un enlace para entrar. Ábrelo en este mismo teléfono.</p>
        <p className="suave">¿No lo ves en un par de minutos? Busca en Spam o en Promociones.</p>
        <OtroEnlace destino={volver} />
      </PantallaEntrada>
    );
  }

  return (
    <PantallaEntrada marca={marca}>
      <h1>Entra a tu asistente</h1>
      <p className="suave">Escribe tu correo y te mandamos un enlace para entrar. No necesitas contraseña.</p>
      {aviso && ERRORES[aviso] && (
        <p className="aviso error" role="alert">
          {ERRORES[aviso]}
        </p>
      )}
      <form action={pedirEnlace} className="pila">
        {corredor && <input type="hidden" name="c" value={corredor} />}
        <label htmlFor="correo">Tu correo</label>
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nombre@correo.com"
          required
        />
        <BotonEnviar texto="Enviarme el enlace" pendiente="Enviando…" className="primario grande" />
      </form>
    </PantallaEntrada>
  );
}
