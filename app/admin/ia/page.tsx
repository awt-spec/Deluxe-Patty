import Link from "next/link";
import { cargarCorredores } from "@/lib/admin/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { Barra, Cifra, Mensaje, usd } from "../ui";
import { guardarTopesPlataforma } from "../acciones";

// IA y topes: cuánto gasta cada corredor (Claude + imágenes de OpenAI) y los topes de la plataforma, que valen
// para todo corredor que no tenga uno propio. Al llegar al tope la IA deja de responder: el chat queda para el
// corredor y no se generan imágenes hasta el día o el mes siguiente.

export default async function IA({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string }> }) {
  const { m, ok } = await searchParams;
  const { filas, plataforma } = await cargarCorredores(createAdminClient());
  const totalHoy = filas.reduce((s, f) => s + f.gastoHoy, 0);
  const totalMes = filas.reduce((s, f) => s + f.gastoMes, 0);
  const frenados = filas.filter((f) => f.gastoHoy >= f.topeDia || f.gastoMes >= f.topeMes).length;

  return (
    <>
      <Mensaje m={m} ok={ok} />
      <header className="adm-encabezado">
        <h1>IA y topes</h1>
        <p>Gasto de Claude y de las imágenes, y los topes que lo frenan.</p>
      </header>

      <div className="adm-cifras">
        <Cifra valor={usd(totalHoy)} etiqueta="gasto hoy (todos)" />
        <Cifra valor={usd(totalMes)} etiqueta="gasto este mes" />
        <Cifra valor={frenados} etiqueta={frenados === 1 ? "corredor frenado" : "corredores frenados"} tono={frenados ? "alerta" : undefined} />
      </div>

      <section className="adm-seccion">
        <h2>Topes de la plataforma</h2>
        <form action={guardarTopesPlataforma} className="adm-form en-linea">
          <label>
            Por día (USD)
            <input name="tope_dia" inputMode="decimal" defaultValue={plataforma.topeDia} required />
          </label>
          <label>
            Por mes (USD)
            <input name="tope_mes" inputMode="decimal" defaultValue={plataforma.topeMes} required />
          </label>
          <button type="submit" className="adm-boton primario">
            Guardar
          </button>
        </form>
        <p className="adm-suave">Un corredor puede tener topes propios en su pantalla (vacío usa estos; 0 apaga la IA de ese corredor).</p>
      </section>

      <section className="adm-seccion">
        <h2>Gasto por corredor</h2>
        <div className="adm-scroll">
          <table className="adm-tabla">
            <thead>
              <tr>
                <th>Corredor</th>
                <th>Hoy</th>
                <th>Este mes</th>
                <th>Imágenes</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.c.id}>
                  <td data-etiqueta="Corredor">
                    <Link href={`/admin/corredores/${f.c.id}#ia`} className="adm-enlace fuerte">
                      {f.c.nombre}
                    </Link>
                  </td>
                  <td data-etiqueta="Hoy">
                    <span className="adm-valor">
                      {usd(f.gastoHoy)} <span className="adm-suave">de {usd(f.topeDia)}</span>
                      <Barra gasto={f.gastoHoy} tope={f.topeDia} />
                    </span>
                  </td>
                  <td data-etiqueta="Este mes">
                    <span className="adm-valor">
                      {usd(f.gastoMes)} <span className="adm-suave">de {usd(f.topeMes)}</span>
                      <Barra gasto={f.gastoMes} tope={f.topeMes} />
                    </span>
                  </td>
                  <td data-etiqueta="Imágenes">{f.c.imagenes_activas ? `${f.mes.imagenes} este mes` : "Apagadas"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="adm-suave">
          El costo de Claude sale del uso de tokens; el de las imágenes es un estimado por el uso que informa OpenAI (precios en las variables{" "}
          <code>OPENAI_PRECIO_*</code>).
        </p>
      </section>
    </>
  );
}
