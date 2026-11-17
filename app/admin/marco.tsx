import { salir } from "../panel/acciones";
import { IconoPantalla, IconoSalir } from "../panel/iconos";
import { NavAdmin } from "./nav";
import { Avatar } from "./ui";

// Marco visual de /admin (sin datos): menú lateral oscuro con la insignia "Administración", las secciones y la cuenta
// abajo; en el teléfono, barra de arriba con la cuenta y las secciones como barra de abajo.

function Cuenta() {
  return (
    <>
      <a href="/panel" className="ad-cuenta-boton">
        <IconoPantalla tamano={20} />
        Ir al panel
      </a>
      <form action={salir}>
        <button type="submit" className="ad-cuenta-boton">
          <IconoSalir tamano={20} />
          Salir
        </button>
      </form>
    </>
  );
}

export function MarcoAdmin({ correo, children }: { correo: string; children: React.ReactNode }) {
  return (
    <div className="adm">
      <a href="#contenido" className="ad-saltar">
        Saltar al contenido
      </a>
      <aside className="ad-lado">
        <div className="ad-marca">
          <span className="ad-marca-logo" aria-hidden>
            P
          </span>
          <span className="ad-marca-texto">
            <strong>Plataforma</strong>
            <span className="ad-marca-insignia">Administración</span>
          </span>
        </div>
        <NavAdmin />
        <div className="ad-pie">
          <div className="ad-pie-usuario">
            <Avatar nombre={correo} tamano={36} tono="verde" />
            <span>
              <strong title={correo}>{correo}</strong>
              <small>Superadministrador</small>
            </span>
          </div>
          <Cuenta />
        </div>
      </aside>

      {/* Teléfono: barra de arriba con la marca y la cuenta. */}
      <div className="ad-arriba">
        <div className="ad-marca">
          <span className="ad-marca-logo" aria-hidden>
            P
          </span>
          <span className="ad-marca-insignia">Administración</span>
        </div>
        <details className="ad-menu-cuenta">
          <summary aria-label="Tu cuenta">
            <Avatar nombre={correo} tamano={36} tono="verde" />
          </summary>
          <div className="ad-menu-cuenta-caja">
            <strong title={correo}>{correo}</strong>
            <small>Superadministrador</small>
            <Cuenta />
          </div>
        </details>
      </div>

      <main className="ad-cuerpo" id="contenido" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
