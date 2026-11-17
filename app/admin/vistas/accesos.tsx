import { IconoAgregar, IconoCandado, IconoCerrar, IconoEscudo, IconoPersonas } from "../../panel/iconos";
import { alternarSuperadmin, cambiarContrasena, crearUsuario, darAcceso, quitarAcceso } from "../acciones";
import { Avatar, Encabezado, Pildora, Tarjeta, Vacio, hace } from "../ui";

// Accesos (vista pura): crear un usuario y la lista de usuarios con sus roles. Quitar el permiso de
// superadministrador a uno mismo o al último queda deshabilitado con la razón a la vista (la acción también lo
// comprueba).

export interface UsuarioAcceso {
  id: string;
  correo: string;
  ultimoIngreso: string | null;
  superadmin: boolean;
  accesos: { corredor_id: string; corredor: string; rol: string }[];
}

export interface DatosAccesos {
  yo: string;
  usuarios: UsuarioAcceso[];
  corredores: { id: string; nombre: string }[];
  /** Filas de la tabla superadmins (puede haber correos sin usuario todavía). */
  totalSuper: number;
  ahora?: Date;
}

function SelectRol({ id }: { id: string }) {
  return (
    <select id={id} name="rol" defaultValue="corredor">
      <option value="corredor">Corredor</option>
      <option value="soporte">Soporte</option>
    </select>
  );
}

export function VistaAccesos({ yo, usuarios, corredores, totalSuper, ahora = new Date() }: DatosAccesos) {

  return (
    <>
      <Encabezado titulo="Accesos" descripcion="Quién puede entrar, a qué corredor y quién es superadministrador." />

      <Tarjeta
        titulo="Crear un usuario"
        icono={<IconoAgregar tamano={20} />}
        descripcion="Crea la cuenta con una contraseña que tú pones y, si eliges un corredor, le da acceso a su panel. Entra con su correo y esa contraseña. La contraseña no se guarda en ningún registro."
      >
        <form action={crearUsuario} className="ad-campos ad-crear-usuario">
          <div className="ad-campo">
            <label htmlFor="nuevo-correo">Correo</label>
            <input id="nuevo-correo" name="correo" type="email" autoComplete="off" placeholder="correo@ejemplo.com" required />
          </div>
          <div className="ad-campo">
            <label htmlFor="nuevo-contrasena">Contraseña</label>
            <input id="nuevo-contrasena" name="contrasena" type="text" autoComplete="off" minLength={10} maxLength={72} placeholder="10 caracteres o más" required aria-describedby="nuevo-contrasena-ayuda" />
            <small id="nuevo-contrasena-ayuda">De 10 a 72 caracteres. Pásasela por un canal seguro.</small>
          </div>
          <div className="ad-campo">
            <label htmlFor="nuevo-corredor">Corredor</label>
            <select id="nuevo-corredor" name="corredor_id" defaultValue="">
              <option value="">Ninguno (solo superadmin)</option>
              {corredores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="ad-campo">
            <label htmlFor="nuevo-rol">Rol</label>
            <SelectRol id="nuevo-rol" />
          </div>
          <div className="ad-acciones-form">
            <button type="submit" className="ad-boton primario">
              <IconoAgregar tamano={18} /> Crear usuario
            </button>
          </div>
        </form>
      </Tarjeta>

      <Tarjeta titulo={`Usuarios (${usuarios.length})`} icono={<IconoPersonas tamano={20} />} descripcion="Toca «Acciones» en un usuario para darle acceso, cambiar su contraseña o su permiso.">
        {usuarios.length === 0 ? (
          <Vacio icono={<IconoPersonas tamano={28} />} titulo="Todavía no hay usuarios">
            Crea el primero arriba.
          </Vacio>
        ) : (
          <ul className="ad-usuarios">
            {usuarios.map((u) => {
              const soyYo = u.correo.toLowerCase() === yo.toLowerCase();
              const sinAcceso = !u.superadmin && u.accesos.length === 0;
              const bloqueo = u.superadmin && soyYo ? "No puedes quitarte el permiso a ti mismo." : u.superadmin && totalSuper <= 1 ? "Es el único superadministrador: antes haz superadministrador a otra persona." : null;
              return (
                <li key={u.id} className="ad-usuario">
                  <div className="ad-usuario-cab">
                    <Avatar nombre={u.correo || "?"} tamano={40} tono={u.superadmin ? "verde" : undefined} />
                    <span className="ad-usuario-nombre">
                      <strong>
                        {u.correo || "(sin correo)"}
                        {soyYo && <span className="ad-suave"> · tú</span>}
                      </strong>
                      <span className="ad-suave">Último ingreso {hace(u.ultimoIngreso, ahora)}</span>
                    </span>
                  </div>
                  <div className="ad-roles">
                    {u.superadmin && (
                      <Pildora tono="info" punto={false}>
                        <IconoEscudo tamano={14} /> Superadministrador
                      </Pildora>
                    )}
                    {u.accesos.map((x) => (
                      <form key={x.corredor_id} action={quitarAcceso} className="ad-rol-form">
                        <input type="hidden" name="corredor_id" value={x.corredor_id} />
                        <input type="hidden" name="user_id" value={u.id} />
                        <input type="hidden" name="volver" value="accesos" />
                        <span className={`ad-pildora ${x.rol === "soporte" ? "gris" : "bien"} con-x`}>
                          {x.corredor} · {x.rol === "soporte" ? "soporte" : "corredor"}
                          <button type="submit" className="ad-x" aria-label={`Quitar el acceso a ${x.corredor}`} title="Quitar acceso">
                            <IconoCerrar tamano={14} />
                          </button>
                        </span>
                      </form>
                    ))}
                    {sinAcceso && <Pildora tono="mal">Sin acceso: al entrar verá «Todavía no tienes acceso»</Pildora>}
                  </div>

                  <details className="ad-detalle">
                    <summary>Acciones</summary>
                    <div className="ad-usuario-acciones">
                      <form action={darAcceso} className="ad-form-linea">
                        <input type="hidden" name="correo" value={u.correo} />
                        <input type="hidden" name="volver" value="accesos" />
                        <div className="ad-campo crece">
                          <label htmlFor={`acc-${u.id}`}>Dar acceso a un corredor</label>
                          <select id={`acc-${u.id}`} name="corredor_id" required defaultValue="">
                            <option value="" disabled>
                              Elige uno
                            </option>
                            {corredores.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="ad-campo">
                          <label htmlFor={`rol-${u.id}`}>Rol</label>
                          <SelectRol id={`rol-${u.id}`} />
                        </div>
                        <button type="submit" className="ad-boton">
                          Dar acceso
                        </button>
                      </form>

                      <form action={cambiarContrasena} className="ad-form-linea">
                        <input type="hidden" name="user_id" value={u.id} />
                        <div className="ad-campo crece">
                          <label htmlFor={`pw-${u.id}`}>Nueva contraseña</label>
                          <input id={`pw-${u.id}`} name="contrasena" type="text" autoComplete="off" minLength={10} maxLength={72} placeholder="10 caracteres o más" required />
                        </div>
                        <button type="submit" className="ad-boton">
                          <IconoCandado tamano={18} /> Cambiar contraseña
                        </button>
                      </form>

                      <form action={alternarSuperadmin} className="ad-super">
                        <input type="hidden" name="correo" value={u.correo} />
                        <input type="hidden" name="hacer" value={u.superadmin ? "0" : "1"} />
                        <button
                          type="submit"
                          className={`ad-boton${u.superadmin ? " peligro" : ""}`}
                          disabled={!!bloqueo}
                          title={bloqueo ?? undefined}
                          aria-describedby={`super-${u.id}`}
                        >
                          <IconoEscudo tamano={18} /> {u.superadmin ? "Quitar superadministrador" : "Hacer superadministrador"}
                        </button>
                        <p id={`super-${u.id}`} className={`ad-ayuda${bloqueo ? " bloqueo" : ""}`}>
                          {bloqueo ??
                            (u.superadmin
                              ? "Deja de ver /admin y de poder cambiar topes."
                              : "Un superadministrador cambia los topes de gasto de IA de todos los corredores y ve toda la plataforma.")}
                        </p>
                      </form>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}
