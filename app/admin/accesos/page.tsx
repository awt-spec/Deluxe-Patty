import { sesionSuperadmin } from "@/lib/admin/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Insignia, Mensaje, hace } from "../ui";
import { alternarSuperadmin, cambiarContrasena, crearUsuario, darAcceso, quitarAcceso } from "../acciones";

// Accesos: quién puede entrar, a qué corredor y quién es superadministrador. Todo se hace aquí, sin entrar a Supabase.

export default async function Accesos({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string }> }) {
  const { m, ok } = await searchParams;
  const { correo: yo } = await sesionSuperadmin();
  const db = createAdminClient();
  const [{ data: lista }, { data: miembros }, { data: corredores }, { data: supers }] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("miembros").select("user_id, corredor_id, rol"),
    db.from("corredores").select("id, nombre").order("nombre"),
    db.from("superadmins").select("correo"),
  ]);
  const usuarios = [...(lista?.users ?? [])].sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  const nombreCorredor = new Map((corredores ?? []).map((c) => [c.id as string, c.nombre as string]));
  const esSuper = new Set((supers ?? []).map((s) => String(s.correo).toLowerCase()));

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <header className="adm-encabezado">
        <h1>Accesos</h1>
        <p>Quién puede entrar, a qué corredor y quién es superadministrador.</p>
      </header>

      <section className="adm-seccion">
        <h2>Crear un usuario</h2>
        <p className="adm-suave">
          Crea la cuenta con una contraseña que tú pones (10 caracteres o más) y, si eliges un corredor, le da acceso a su panel. Entra en la pantalla de
          entrada con su correo y esa contraseña. La contraseña no se guarda en ningún registro.
        </p>
        <form action={crearUsuario} className="adm-form en-linea">
          <label>
            Correo
            <input name="correo" type="email" autoComplete="off" placeholder="correo@ejemplo.com" required />
          </label>
          <label>
            Contraseña
            <input name="contrasena" type="text" autoComplete="off" minLength={10} maxLength={72} placeholder="10 caracteres o más" required />
          </label>
          <label>
            Corredor
            <select name="corredor_id" defaultValue="">
              <option value="">Ninguno (solo superadmin)</option>
              {(corredores ?? []).map((c) => (
                <option key={c.id as string} value={c.id as string}>
                  {c.nombre as string}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rol
            <select name="rol" defaultValue="corredor">
              <option value="corredor">Corredor</option>
              <option value="soporte">Soporte</option>
            </select>
          </label>
          <button type="submit" className="adm-boton primario">
            Crear usuario
          </button>
        </form>
      </section>

      <section className="adm-seccion">
        <h2>Usuarios ({usuarios.length})</h2>
        <div className="adm-usuarios">
          {usuarios.map((u) => {
            const correo = u.email ?? "";
            const suyos = (miembros ?? []).filter((x) => x.user_id === u.id);
            const super_ = esSuper.has(correo.toLowerCase());
            const sinAcceso = !super_ && suyos.length === 0;
            return (
              <article key={u.id} className="adm-usuario">
                <div className="adm-usuario-cab">
                  <strong>{correo || "(sin correo)"}</strong>
                  <span className="adm-suave">Último ingreso {hace(u.last_sign_in_at)}</span>
                </div>
                <div className="adm-insignias">
                  {super_ && <Insignia tono="ambar">Superadministrador</Insignia>}
                  {suyos.map((x) => (
                    <form key={x.corredor_id as string} action={quitarAcceso} className="adm-insignia-form">
                      <input type="hidden" name="corredor_id" value={x.corredor_id as string} />
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="volver" value="accesos" />
                      <Insignia tono="verde">
                        {nombreCorredor.get(x.corredor_id as string) ?? "Corredor"} · {x.rol === "soporte" ? "soporte" : "corredor"}
                      </Insignia>
                      <button type="submit" className="adm-x" aria-label={`Quitar el acceso a ${nombreCorredor.get(x.corredor_id as string) ?? "este corredor"}`} title="Quitar acceso">
                        ×
                      </button>
                    </form>
                  ))}
                  {sinAcceso && <Insignia tono="rojo">Sin acceso a nada: al entrar verá «Todavía no tienes acceso»</Insignia>}
                </div>

                <details className="adm-detalle">
                  <summary>Acciones</summary>
                  <div className="adm-acciones">
                    <form action={darAcceso} className="adm-form en-linea">
                      <input type="hidden" name="correo" value={correo} />
                      <input type="hidden" name="volver" value="accesos" />
                      <label>
                        Dar acceso a un corredor
                        <select name="corredor_id" required defaultValue="">
                          <option value="" disabled>
                            Elige uno
                          </option>
                          {(corredores ?? []).map((c) => (
                            <option key={c.id as string} value={c.id as string}>
                              {c.nombre as string}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Rol
                        <select name="rol" defaultValue="corredor">
                          <option value="corredor">Corredor</option>
                          <option value="soporte">Soporte</option>
                        </select>
                      </label>
                      <button type="submit" className="adm-boton">
                        Dar acceso
                      </button>
                    </form>

                    <form action={cambiarContrasena} className="adm-form en-linea">
                      <input type="hidden" name="user_id" value={u.id} />
                      <label>
                        Nueva contraseña
                        <input name="contrasena" type="text" autoComplete="off" minLength={10} maxLength={72} placeholder="10 caracteres o más" required />
                      </label>
                      <button type="submit" className="adm-boton">
                        Cambiar contraseña
                      </button>
                    </form>

                    <form action={alternarSuperadmin}>
                      <input type="hidden" name="correo" value={correo} />
                      <input type="hidden" name="hacer" value={super_ ? "0" : "1"} />
                      <button type="submit" className={`adm-boton${super_ ? " peligro" : ""}`} disabled={super_ && correo.toLowerCase() === yo.toLowerCase()}>
                        {super_ ? "Quitar superadministrador" : "Hacer superadministrador"}
                      </button>
                      {!super_ && (
                        <p className="adm-suave">
                          Un superadministrador cambia los topes de gasto de IA de todos los corredores y ve toda la plataforma. Quítalo cuando haya un
                          segundo corredor.
                        </p>
                      )}
                      {super_ && correo.toLowerCase() === yo.toLowerCase() && <p className="adm-suave">No puedes quitarte el permiso a ti mismo.</p>}
                    </form>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
