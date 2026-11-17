import Link from "next/link";
import type { FilaAdmin } from "@/lib/admin/datos";
import { describirAlerta, estaPausado, estadoCorredor, estadoWhatsApp, nivelUso, type Atencion } from "@/lib/admin/atencion";
import { estadoEnergia } from "@/lib/ia/energia";
import { IconoAlerta, IconoCampana, IconoCheck, IconoChats, IconoFlecha, IconoInfo, IconoPersonas, IconoRayo } from "../../panel/iconos";
import { Avatar, Encabezado, EnergiaMes, Kpi, Pildora, Tarjeta, Vacio, hace, usd } from "../ui";

// Resumen (vista pura): cifras con ícono, lo que pide atención como tarjetas con su botón, los corredores de un
// vistazo y las últimas alertas como línea de tiempo.

export interface DatosResumen {
  filas: FilaAdmin[];
  atencion: Atencion[];
  alertas: { clave: string; enviada_at: string }[];
  alertas24h: number;
  ahora?: Date;
}

const ICONO_TONO = { mal: <IconoAlerta tamano={20} />, poco: <IconoAlerta tamano={20} />, info: <IconoInfo tamano={20} /> };
const NOMBRE_TONO = { mal: "Urgente", poco: "Revisar", info: "Para saber" };

export function VistaResumen({ filas, atencion, alertas, alertas24h, ahora = new Date() }: DatosResumen) {
  const activos = filas.filter((f) => f.c.activo);
  const mensajesMes = filas.reduce((s, f) => s + f.mensajesMes, 0);
  const totalMes = filas.reduce((s, f) => s + f.gastoMes, 0);
  const topeMes = activos.reduce((s, f) => s + f.topeMes, 0);
  const energia = estadoEnergia({ gastoMesUsd: totalMes, topeMesUsd: topeMes });
  // Frenados de verdad: activos que llegaron al tope. Un pausado (tope 0) no es un freno, va aparte.
  const frenados = activos.filter((f) => !estaPausado(f) && (nivelUso(f.gastoHoy, f.topeDia) === "agotado" || nivelUso(f.gastoMes, f.topeMes) === "agotado")).length;
  const urgentes = atencion.filter((a) => a.tono === "mal").length;

  return (
    <>
      <Encabezado titulo="Resumen" descripcion="Cómo va la plataforma hoy y qué necesita tu atención." />

      <div className="ad-kpis">
        <Kpi icono={<IconoPersonas tamano={22} />} etiqueta="Corredores activos" valor={activos.length} detalle={filas.length === 0 ? "Ninguno todavía" : filas.length > activos.length ? `${filas.length - activos.length} en demo` : "Todos activos"} />
        <Kpi icono={<IconoChats tamano={22} />} etiqueta="Mensajes este mes" valor={mensajesMes.toLocaleString("es-CR")} detalle="Entrantes y salientes" />
        <Kpi
          icono={<IconoRayo tamano={22} />}
          etiqueta="Energía usada"
          // Sin tope entre los activos (ninguno, o todos pausados) no hay "100 % usado" que mostrar.
          valor={topeMes > 0 ? `${energia.usado} %` : "—"}
          detalle={topeMes > 0 ? `${usd(totalMes)} de ${usd(topeMes)} este mes` : `${usd(totalMes)} este mes, sin tope activo`}
          tono={frenados ? "mal" : energia.nivel === "poco" ? "poco" : undefined}
        >
          {frenados > 0 && <span className="ad-kpi-detalle ad-txt-mal">{frenados === 1 ? "1 corredor frenado" : `${frenados} corredores frenados`}</span>}
        </Kpi>
        <Kpi
          icono={<IconoCampana tamano={22} />}
          etiqueta="Alertas en 24 h"
          valor={alertas24h}
          detalle={alertas24h === 0 ? "Sin avisos del monitoreo" : "Avisos a soporte"}
          tono={alertas24h > 0 ? "poco" : undefined}
        />
      </div>

      <div className="ad-rejilla-resumen">
        <Tarjeta
          titulo="Atención"
          icono={<IconoAlerta tamano={20} />}
          descripcion={atencion.length === 0 ? undefined : urgentes > 0 ? `${urgentes} ${urgentes === 1 ? "cosa urgente" : "cosas urgentes"} primero.` : "Nada urgente: solo cosas para revisar."}
          className="ad-col-ancha"
        >
          {atencion.length === 0 ? (
            <Vacio icono={<IconoCheck tamano={28} />} titulo="Todo en orden">
              No hay nada pendiente.
            </Vacio>
          ) : (
            <ul className="ad-atencion">
              {atencion.map((a, i) => (
                <li key={i} className={a.tono}>
                  <span className="ad-atencion-icono">{ICONO_TONO[a.tono]}</span>
                  <div>
                    <span className="ad-atencion-tono">{NOMBRE_TONO[a.tono]}</span>
                    <strong>{a.titulo}</strong>
                    <p>{a.texto}</p>
                  </div>
                  <Link href={a.href} className={`ad-boton chico${a.tono === "mal" ? " primario" : ""}`}>
                    {a.accion}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Alertas recientes" icono={<IconoCampana tamano={20} />} descripcion="Lo que el monitoreo avisó a soporte.">
          {alertas.length === 0 ? (
            <Vacio icono={<IconoCheck tamano={28} />} titulo="Sin alertas">
              El monitoreo no ha tenido que avisar nada.
            </Vacio>
          ) : (
            <ol className="ad-linea-tiempo">
              {alertas.map((a) => {
                const d = describirAlerta(a.clave);
                return (
                  <li key={a.clave} className={d.tono}>
                    <span className="ad-linea-punto" aria-hidden />
                    <div>
                      <strong>{d.titulo}</strong>
                      <span className="ad-suave">
                        {hace(a.enviada_at, ahora)} · <code>{d.clave}</code>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Tarjeta>
      </div>

      <Tarjeta
        titulo="Corredores"
        icono={<IconoPersonas tamano={20} />}
        acciones={
          <Link href="/admin/corredores" className="ad-boton chico">
            Ver todos <IconoFlecha tamano={16} />
          </Link>
        }
      >
        {filas.length === 0 ? (
          <Vacio icono={<IconoPersonas tamano={28} />} titulo="Todavía no hay corredores" />
        ) : (
          <ul className="ad-mini-corredores">
            {filas.map((f) => {
              const e = estadoCorredor(f);
              const w = estadoWhatsApp(f);
              return (
                <li key={f.c.id}>
                  <Link href={`/admin/corredores/${f.c.id}`}>
                    <Avatar nombre={f.c.nombre} tamano={40} />
                    <span className="ad-mini-nombre">
                      <strong>{f.c.nombre}</strong>
                      <span className="ad-suave">Último mensaje {hace(f.ultimoEntrante, ahora)}</span>
                    </span>
                    <span className="ad-mini-pildoras">
                      <Pildora tono={e.tono}>{e.texto}</Pildora>
                      <Pildora tono={w.tono}>WhatsApp: {w.texto.toLowerCase()}</Pildora>
                    </span>
                    <span className="ad-mini-energia">
                      <EnergiaMes gastoMes={f.gastoMes} topeMes={f.topeMes} compacta />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}
