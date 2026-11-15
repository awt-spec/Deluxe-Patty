import { BotonEnviar } from "@/app/panel/boton-enviar";
import { IconoCorreo } from "@/app/panel/iconos";
import { demoDisponible } from "@/lib/panel/demo";
import { marcaDeEntrada, slugValido } from "@/lib/panel/marca";
import { esRutaInterna } from "@/lib/panel/sesion-vencida";
import { CampoContrasena } from "./campo-contrasena";
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

export default async function Entrar({ searchParams }: { searchParams: Promise<{ aviso?: string; c?: string; volver?: string }> }) {
  const { aviso, c, volver: volverPedido } = await searchParams;
  // La pantalla del panel a la que vuelve después de entrar (solo rutas /panel/... propias: nada de redirección abierta).
  const volverA = esRutaInterna(volverPedido) ? volverPedido : null;
  const corredor = slugValido(c) ? c : null;
  const marca = await marcaDeEntrada(corredor);
  // "Pedir otro enlace" vuelve a la entrada con la misma marca y la misma pantalla a la que volver.
  const otra = new URLSearchParams();
  if (corredor) otra.set("c", corredor);
  if (volverA) otra.set("volver", volverA);
  const volver = otra.size ? `/entrar?${otra}` : "/entrar";

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
      <p className="suave">Escribe tu correo y tu contraseña.</p>
      {aviso === "sesion" && (
        <p className="aviso" role="status">
          Tu sesión se cerró. Entra de nuevo y sigues donde estabas.
        </p>
      )}
      {aviso && ERRORES[aviso] && (
        <p className="aviso error" role="alert">
          {ERRORES[aviso]}
        </p>
      )}
      <form action={iniciarSesion} className="pila">
        {corredor && <input type="hidden" name="c" value={corredor} />}
        {volverA && <input type="hidden" name="volver" value={volverA} />}
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
        <CampoContrasena />
        <BotonEnviar texto="Entrar" pendiente="Un momento…" className="primario grande" />
        <BotonEnviar
          texto="¿Sin contraseña? Mándame un enlace por correo"
          pendiente="Un momento…"
          className="enlace-boton"
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
