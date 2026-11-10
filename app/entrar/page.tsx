import { BotonEnviar } from "@/app/panel/boton-enviar";
import { IconoCorreo } from "@/app/panel/iconos";
import { demoDisponible } from "@/lib/panel/demo";
import { marcaDeEntrada, slugValido } from "@/lib/panel/marca";
import { entrarDemo, iniciarSesion, pedirEnlace } from "./acciones";
import { OtroEnlace } from "./otro-enlace";
import { PantallaEntrada } from "./pantalla";

const ERRORES: Record<string, string> = {
  correo: "Ese correo parece incompleto. Revísalo y vuelve a intentar.",
  enlace: "Ese enlace ya se usó o venció. Escribe tu correo y te mandamos uno nuevo.",
  demo: "La demo no está disponible en este momento.",
  credenciales: "El correo o la contraseña no son correctos. Revísalos o pide un enlace por correo.",
  limite: "Se pidieron demasiados enlaces o intentos seguidos. Espera unos minutos y vuelve a intentar.",
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
      <p className="suave">Escribe tu correo y tu contraseña. Si no la tienes, te mandamos un enlace para entrar.</p>
      {aviso && ERRORES[aviso] && (
        <p className="aviso error" role="alert">
          {ERRORES[aviso]}
        </p>
      )}
      <form action={iniciarSesion} className="pila">
        {corredor && <input type="hidden" name="c" value={corredor} />}
        <label htmlFor="correo">Tu correo</label>
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nombre@correo.com"
          required
        />
        <label htmlFor="contrasena">Tu contraseña</label>
        <input id="contrasena" name="contrasena" type="password" autoComplete="current-password" maxLength={200} />
        <BotonEnviar texto="Entrar" pendiente="Un momento…" className="primario grande" />
        <BotonEnviar
          texto="Mejor mándame un enlace por correo"
          pendiente="Un momento…"
          className="grande secundario"
          formAction={pedirEnlace}
        />
      </form>
      {demoDisponible() && (
        <form action={entrarDemo} className="entrada-demo">
          <p className="separador">
            <span>¿Solo quieres conocerla?</span>
          </p>
          <BotonEnviar texto="Ver la demo" pendiente="Entrando…" className="grande secundario" />
          <p className="suave">Con casas y clientes de prueba. Nada se manda a nadie.</p>
        </form>
      )}
    </PantallaEntrada>
  );
}
