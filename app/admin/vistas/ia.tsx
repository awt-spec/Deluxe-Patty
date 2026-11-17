import Link from "next/link";
import type { FilaAdmin } from "@/lib/admin/datos";
import { estaPausado, nivelUso } from "@/lib/admin/atencion";
import { estadoEnergia } from "@/lib/ia/energia";
import { IconoAlerta, IconoInfo, IconoRayo, IconoReloj, IconoResumen } from "../../panel/iconos";
import { guardarTopesPlataforma } from "../acciones";
import { CampoUsd } from "../campo-usd";
import { Avatar, Barra, EXPLICA_ENERGIA, Encabezado, EnergiaMes, Kpi, Nota, Pildora, Tarjeta, Vacio, usd } from "../ui";

// IA y topes (vista pura): cifras del gasto, los topes de la plataforma con su equivalente en energía mientras se
// escriben (campo-usd.tsx) y la tabla por corredor con sus topes propios (o "plataforma").

export interface DatosIA {
  filas: FilaAdmin[];
  plataforma: { topeDia: number; topeMes: number };
}

function TopePropio({ valor, plataforma }: { valor: number | null; plataforma: number }) {
  // En dos líneas: así la tabla cabe en una computadora sin cortar el botón "Cambiar".
  if (valor === null)
    return (
      <span className="ad-suave ad-tope-plataforma">
        Plataforma <span className="ad-num">({usd(plataforma)})</span>
      </span>
    );
  if (valor === 0)
    return (
      <Pildora tono="info" punto={false}>
        Pausado (tope 0)
      </Pildora>
    );
  return (
    <Pildora tono="info" punto={false}>
      Propio: {usd(valor)}
    </Pildora>
  );
}

export function VistaIA({ filas, plataforma }: DatosIA) {
  const totalHoy = filas.reduce((s, f) => s + f.gastoHoy, 0);
  const totalMes = filas.reduce((s, f) => s + f.gastoMes, 0);
  const topeMes = filas.filter((f) => f.c.activo).reduce((s, f) => s + f.topeMes, 0);
  // Frenados de verdad: activos que llegaron al tope (un pausado con tope 0 no cuenta, se ve como "Pausado").
  const frenados = filas.filter((f) => f.c.activo && !estaPausado(f) && (nivelUso(f.gastoHoy, f.topeDia) === "agotado" || nivelUso(f.gastoMes, f.topeMes) === "agotado")).length;
  const e = estadoEnergia({ gastoMesUsd: totalMes, topeMesUsd: topeMes });

  return (
    <>
      <Encabezado titulo="IA y topes" descripcion="Gasto de Claude, de las imágenes y del audio, y los topes que lo frenan." />

      <div className="ad-kpis tres">
        <Kpi icono={<IconoReloj tamano={22} />} etiqueta="Gasto de hoy" valor={usd(totalHoy)} detalle="Todos los corredores" />
        <Kpi icono={<IconoResumen tamano={22} />} etiqueta="Gasto del mes" valor={usd(totalMes)} detalle={`Energía usada ${e.usado} % de ${usd(topeMes)}`} />
        <Kpi
          icono={<IconoAlerta tamano={22} />}
          etiqueta="Corredores frenados"
          valor={frenados}
          detalle={frenados ? "La IA no les contesta: los chats quedan para el corredor" : "Ninguno llegó al tope"}
          tono={frenados ? "mal" : "bien"}
        />
      </div>

      <Tarjeta
        titulo="Topes de la plataforma"
        icono={<IconoRayo tamano={20} />}
        descripcion="Valen para todo corredor que no tenga uno propio. Al lado de cada monto ves cuánto es en energía."
      >
        <form action={guardarTopesPlataforma} className="ad-subform sin-linea">
          <div className="ad-campos dos">
            <CampoUsd etiqueta="Por día (USD)" name="tope_dia" defaultValue={plataforma.topeDia} periodo="día" required />
            <CampoUsd etiqueta="Por mes (USD)" name="tope_mes" defaultValue={plataforma.topeMes} periodo="mes" required />
          </div>
          <Nota>
            <IconoInfo tamano={18} />
            <span>
              {EXPLICA_ENERGIA} Un corredor puede tener topes propios en su pantalla (vacío usa estos; 0 apaga la IA de ese corredor).
            </span>
          </Nota>
          <div className="ad-acciones-form">
            <button type="submit" className="ad-boton primario">
              Guardar topes
            </button>
          </div>
        </form>
      </Tarjeta>

      <Tarjeta titulo="Gasto y topes por corredor" icono={<IconoResumen tamano={20} />} descripcion="Los topes propios se cambian en la pantalla de cada corredor.">
        {filas.length === 0 ? (
          <Vacio titulo="Todavía no hay corredores" />
        ) : (
          <div className="ad-tabla-marco">
            <table className="ad-tabla ad-tabla-ia">
              <thead>
                <tr>
                  <th scope="col">Corredor</th>
                  <th scope="col">Hoy</th>
                  <th scope="col">Energía del mes</th>
                  <th scope="col">Tope por día</th>
                  <th scope="col">Tope por mes</th>
                  <th scope="col">Imágenes</th>
                  <th scope="col">
                    <span className="ad-oculto">Cambiar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.c.id}>
                    <td className="ad-celda-nombre">
                      <div className="ad-nombre-fila">
                        <Avatar nombre={f.c.nombre} tamano={36} />
                      <span>
                        <Link href={`/admin/corredores/${f.c.id}#ia`} className="ad-enlace-fila">
                          {f.c.nombre}
                        </Link>
                      </span>
                      </div>
                    </td>
                    <td data-etiqueta="Hoy">
                      <span className="ad-celda-uso">
                        <span className="ad-num">
                          {usd(f.gastoHoy)} <span className="ad-suave">de {usd(f.topeDia)}</span>
                        </span>
                        <Barra gasto={f.gastoHoy} tope={f.topeDia} etiqueta="Gasto de hoy" />
                      </span>
                    </td>
                    <td data-etiqueta="Energía" className="ad-celda-energia">
                      <EnergiaMes gastoMes={f.gastoMes} topeMes={f.topeMes} compacta />
                    </td>
                    <td data-etiqueta="Tope por día">
                      <TopePropio valor={f.c.tope_ia_dia_usd === null ? null : Number(f.c.tope_ia_dia_usd)} plataforma={plataforma.topeDia} />
                    </td>
                    <td data-etiqueta="Tope por mes">
                      <TopePropio valor={f.c.tope_ia_mes_usd === null ? null : Number(f.c.tope_ia_mes_usd)} plataforma={plataforma.topeMes} />
                    </td>
                    <td data-etiqueta="Imágenes">
                      {f.c.imagenes_activas ? (
                        <span className="ad-num">{f.mes.imagenes} este mes</span>
                      ) : (
                        <Pildora tono="gris" punto={false}>
                          Apagadas
                        </Pildora>
                      )}
                    </td>
                    <td className="ad-celda-ver">
                      <Link href={`/admin/corredores/${f.c.id}#ia`} className="ad-boton chico" aria-label={`Cambiar los topes de ${f.c.nombre}`}>
                        Cambiar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ad-ayuda">
          El costo de Claude sale del uso de tokens; el de las imágenes es un estimado por el uso que informa OpenAI (precios en las variables{" "}
          <code>OPENAI_PRECIO_*</code>).
        </p>
      </Tarjeta>
    </>
  );
}
