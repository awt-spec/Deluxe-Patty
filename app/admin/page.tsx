import Link from "next/link";
import { sesionSuperadmin } from "@/lib/admin/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Aviso } from "../panel/aviso";
import { salir } from "../panel/acciones";
import { guardarCorredor, guardarTopesPlataforma, probarWhatsApp } from "./acciones";

// Superadministrador: cuánto gasta en IA cada corredor (Claude + imágenes de OpenAI), hoy y en el mes,
// y los topes que frenan ese gasto: los de la plataforma y, si hace falta, uno propio por corredor.

export const dynamic = "force-dynamic";
export const metadata = { title: "Superadministrador", robots: { index: false } };

type FilaCorredor = {
  id: string;
  nombre: string;
  activo: boolean;
  zona_horaria: string;
  tope_ia_dia_usd: number | null;
  tope_ia_mes_usd: number | null;
  imagenes_activas: boolean;
  whatsapp_phone_number_id: string | null;
};
type Uso = { corredor_id: string; costo_claude_usd: number; costo_imagenes_usd: number; imagenes: number; llamadas_claude: number };

const usd = (n: number) => `$${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaEn = (zona: string, d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(d);

function Barra({ gasto, tope }: { gasto: number; tope: number }) {
  const pct = tope > 0 ? Math.min(100, (gasto / tope) * 100) : 100;
  return (
    <span className={`admin-barra${pct >= 100 ? " lleno" : pct >= 80 ? " cerca" : ""}`} title={`${Math.round(pct)}% del tope`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { correo } = await sesionSuperadmin();
  const db = createAdminClient();
  const [{ data: plataforma }, { data: corredoresData }] = await Promise.all([
    db.from("plataforma").select("tope_ia_dia_usd, tope_ia_mes_usd, updated_at").eq("id", true).maybeSingle(),
    db.from("corredores").select("id, nombre, activo, zona_horaria, tope_ia_dia_usd, tope_ia_mes_usd, imagenes_activas, whatsapp_phone_number_id").order("activo", { ascending: false }).order("nombre"),
  ]);
  const corredores = (corredoresData ?? []) as FilaCorredor[];
  const topeDiaPlataforma = Number(plataforma?.tope_ia_dia_usd ?? 10);
  const topeMesPlataforma = Number(plataforma?.tope_ia_mes_usd ?? 150);

  // Uso de hoy y del mes en la fecha local de cada corredor (la misma que usan los topes).
  const dias = [...new Set(corredores.map((c) => fechaEn(c.zona_horaria)))];
  const meses = [...new Set(dias.map((d) => `${d.slice(0, 7)}-01`))];
  const [{ data: hoyData }, { data: mesData }] = await Promise.all([
    db.from("uso_diario").select("corredor_id, dia, costo_claude_usd, costo_imagenes_usd, imagenes, llamadas_claude").in("dia", dias.length ? dias : ["1900-01-01"]),
    db.from("uso_mensual").select("corredor_id, mes, costo_claude_usd, costo_imagenes_usd, imagenes, llamadas_claude").in("mes", meses.length ? meses : ["1900-01-01"]),
  ]);
  const usoDe = (filas: (Uso & { dia?: string; mes?: string })[] | null, c: FilaCorredor, clave: "dia" | "mes"): Uso => {
    const hoy = fechaEn(c.zona_horaria);
    const buscado = clave === "dia" ? hoy : `${hoy.slice(0, 7)}-01`;
    const f = (filas ?? []).find((x) => x.corredor_id === c.id && x[clave] === buscado);
    return {
      corredor_id: c.id,
      costo_claude_usd: Number(f?.costo_claude_usd ?? 0),
      costo_imagenes_usd: Number(f?.costo_imagenes_usd ?? 0),
      imagenes: Number(f?.imagenes ?? 0),
      llamadas_claude: Number(f?.llamadas_claude ?? 0),
    };
  };
  const filas = corredores.map((c) => {
    const hoy = usoDe(hoyData as never, c, "dia");
    const mes = usoDe(mesData as never, c, "mes");
    return {
      c,
      hoy,
      mes,
      gastoHoy: hoy.costo_claude_usd + hoy.costo_imagenes_usd,
      gastoMes: mes.costo_claude_usd + mes.costo_imagenes_usd,
      topeDia: c.tope_ia_dia_usd ?? topeDiaPlataforma,
      topeMes: c.tope_ia_mes_usd ?? topeMesPlataforma,
    };
  });
  const totalHoy = filas.reduce((s, f) => s + f.gastoHoy, 0);
  const totalMes = filas.reduce((s, f) => s + f.gastoMes, 0);
  const frenados = filas.filter((f) => f.gastoHoy >= f.topeDia || f.gastoMes >= f.topeMes).length;

  return (
    <div className="marco tema">
      <main className="panel admin">
        <header className="encabezado">
          <div>
            <h1>Superadministrador</h1>
            <p className="suave">{correo}</p>
          </div>
          <div className="botones">
            <Link href="/panel" className="boton">
              Ir al panel
            </Link>
            <form action={salir}>
              <button type="submit">Salir</button>
            </form>
          </div>
        </header>
        <Aviso texto={aviso} />

        <div className="cifras">
          <div className="tarjeta cifra">
            <strong>{usd(totalHoy)}</strong>
            <span className="suave">gasto de IA hoy (todos)</span>
          </div>
          <div className="tarjeta cifra">
            <strong>{usd(totalMes)}</strong>
            <span className="suave">gasto de IA este mes</span>
          </div>
          <div className={`tarjeta cifra${frenados ? " alerta" : ""}`}>
            <strong>{frenados}</strong>
            <span className="suave">{frenados === 1 ? "corredor frenado por tope" : "corredores frenados por tope"}</span>
          </div>
        </div>

        <section className="tarjeta pila">
          <h2>Topes de la plataforma</h2>
          <p className="suave">
            Se usan para todo corredor que no tenga uno propio. Al llegar al tope, la IA deja de responder (el chat queda para el
            corredor) y no se generan imágenes hasta el día o el mes siguiente. Cuenta Claude más las imágenes de OpenAI.
          </p>
          <form action={guardarTopesPlataforma} className="admin-topes">
            <label>
              Por día (USD)
              <input name="tope_dia" type="text" inputMode="decimal" defaultValue={topeDiaPlataforma} required />
            </label>
            <label>
              Por mes (USD)
              <input name="tope_mes" type="text" inputMode="decimal" defaultValue={topeMesPlataforma} required />
            </label>
            <button type="submit" className="primario">
              Guardar
            </button>
          </form>
        </section>

        <section className="pila">
          <h2>Corredores</h2>
          {filas.map(({ c, hoy, mes, gastoHoy, gastoMes, topeDia, topeMes }) => (
            <article key={c.id} className="tarjeta pila admin-corredor">
              <div className="fila">
                <h3>
                  {c.nombre} {!c.activo && <span className="insignia">Demo / inactivo</span>}
                </h3>
                {(gastoHoy >= topeDia || gastoMes >= topeMes) && <span className="insignia alerta">Frenado por tope</span>}
              </div>
              <div className="admin-uso">
                <div>
                  <span className="suave">Hoy</span>
                  <strong>
                    {usd(gastoHoy)} <span className="suave">de {usd(topeDia)}</span>
                  </strong>
                  <Barra gasto={gastoHoy} tope={topeDia} />
                  <small className="suave">
                    Claude {usd(hoy.costo_claude_usd)} ({hoy.llamadas_claude} llamadas) · Imágenes {usd(hoy.costo_imagenes_usd)} ({hoy.imagenes})
                  </small>
                </div>
                <div>
                  <span className="suave">Este mes</span>
                  <strong>
                    {usd(gastoMes)} <span className="suave">de {usd(topeMes)}</span>
                  </strong>
                  <Barra gasto={gastoMes} tope={topeMes} />
                  <small className="suave">
                    Claude {usd(mes.costo_claude_usd)} ({mes.llamadas_claude} llamadas) · Imágenes {usd(mes.costo_imagenes_usd)} ({mes.imagenes})
                  </small>
                </div>
              </div>
              <form action={guardarCorredor} className="admin-topes">
                <input type="hidden" name="id" value={c.id} />
                <label>
                  Tope propio por día
                  <input name="tope_dia" type="text" inputMode="decimal" defaultValue={c.tope_ia_dia_usd ?? ""} placeholder={`${topeDiaPlataforma} (plataforma)`} />
                </label>
                <label>
                  Tope propio por mes
                  <input name="tope_mes" type="text" inputMode="decimal" defaultValue={c.tope_ia_mes_usd ?? ""} placeholder={`${topeMesPlataforma} (plataforma)`} />
                </label>
                <label className="casilla">
                  <input type="checkbox" name="imagenes" defaultChecked={c.imagenes_activas} /> Puede generar imágenes
                </label>
                <button type="submit">Guardar</button>
              </form>
              {c.activo && (
                <form action={probarWhatsApp} className="admin-topes admin-prueba-wa">
                  <input type="hidden" name="id" value={c.id} />
                  <label>
                    Probar WhatsApp{" "}
                    <span className="suave">
                      {c.whatsapp_phone_number_id ? `(número ${c.whatsapp_phone_number_id})` : "(sin número de WhatsApp en la base)"}
                    </span>
                    <input name="telefono" type="tel" inputMode="tel" placeholder="+506 8888 8888" required disabled={!c.whatsapp_phone_number_id} />
                  </label>
                  <button type="submit" disabled={!c.whatsapp_phone_number_id}>
                    Mandar hello_world
                  </button>
                </form>
              )}
            </article>
          ))}
          {filas.length === 0 && <p className="vacio">Todavía no hay corredores.</p>}
        </section>
        <p className="suave">
          El costo de Claude sale del uso de tokens; el de las imágenes es un estimado por el uso que informa OpenAI (precios en
          las variables OPENAI_PRECIO_*). Un tope en 0 apaga la IA de ese corredor. Vacío: usa el de la plataforma.
        </p>
      </main>
    </div>
  );
}
