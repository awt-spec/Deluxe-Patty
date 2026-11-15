import Link from "next/link";
import { diaLargo } from "@/lib/agenda/formato";
import { cuentaEnJuego, datosDelNegocio, liquidacionCierre } from "@/lib/crm/contable";
import { monedaDe, reglaComision } from "@/lib/crm/dinero";
import { precio } from "@/lib/formato";
import { guardarCierre, guardarOportunidad } from "../../acciones";
import { TablaContable } from "../../../tabla-contable";
import { SeccionPlegable } from "../movil";
import { FotoCasa } from "./foto-casa";
import { juegoAbierto, modoJuego, resumenJuego, type EnJuego } from "./reglas";
import type { CasaCorta, ClienteFicha } from "./tipos";

// "Lo que está en juego" (#juego): según la etapa, el cierre ya anotado, el formulario para anotarlo o la casa que le
// interesa y la oferta con la comisión estimada.

type Negocio = Pick<
  ClienteFicha,
  "id" | "etapa" | "busca" | "created_at" | "oferta_monto" | "oferta_moneda" | "cierre_precio" | "cierre_comision" | "cierre_moneda" | "cierre_at"
>;

type Comun = {
  c: Negocio;
  juego: EnJuego;
  casaInteres: CasaCorta | null;
  todas: CasaCorta[];
  comisionPct: number;
};
type DelCierre = Comun & {
  casaCierre: CasaCorta | null;
  zona: string;
  visitasHechas: number;
};

export function LoQueEstaEnJuego(p: DelCierre) {
  const { c } = p;
  const modo = modoJuego(c.etapa, c.cierre_precio);
  return (
    <SeccionPlegable
      id="juego"
      className="tarjeta fc-bloque"
      dataPatty="cliente-oportunidad"
      resumen={resumenJuego(p.casaInteres, p.juego, c.oferta_monto)}
      abierta={juegoAbierto(c.etapa, c.oferta_monto)}
    >
      {modo === "cerro" ? <Cerro {...p} /> : modo === "anotar-cierre" ? <AnotarCierre {...p} /> : <EnJuegoAhora {...p} />}
    </SeccionPlegable>
  );
}

/**
 * El cierre como estado de cuenta: la casa con su foto y la fecha, la liquidación (lista, descuento, precio final,
 * comisión, IVA estimado y total a facturar), datos del negocio y, plegado, el formulario para corregirlo.
 */
function Cerro({ c, casaCierre, zona, visitasHechas, comisionPct, todas }: DelCierre) {
  const moneda = monedaDe(c.cierre_moneda);
  const precioFinal = Number(c.cierre_precio);
  // Venta o alquiler: lo dice la casa; si no hay casa, lo que el cliente buscaba (igual que al guardar el cierre).
  const operacion = casaCierre?.operacion ?? (c.busca ?? {}).operacion ?? null;
  const cuenta = liquidacionCierre({
    precioFinal,
    moneda,
    comision: c.cierre_comision === null ? null : Number(c.cierre_comision),
    comisionPct,
    operacion,
    lista: casaCierre ? { precio: casaCierre.precio, moneda: casaCierre.moneda } : null,
  });
  const datos = datosDelNegocio({
    llegoAt: c.created_at,
    cierreAt: c.cierre_at,
    visitasHechas,
    oferta: { monto: c.oferta_monto, moneda: c.oferta_moneda },
    precioFinal,
    moneda,
  });
  const casa = casaCierre ? (
    <>
      <FotoCasa fotos={casaCierre.fotos} tamano={28} />
      <span>
        <small>{cuenta.alquiler ? "Alquiló" : "Compró"}</small>
        <strong>{casaCierre.titulo}</strong>
        {c.cierre_at && <span className="suave">{diaLargo(new Date(c.cierre_at), zona)}</span>}
      </span>
    </>
  ) : null;
  return (
    <>
      <div className="fc-bloque-cabeza">
        <h2>Cerró</h2>
        <span className="fc-cierre-moneda">{moneda === "CRC" ? "En colones" : "En dólares"}</span>
      </div>
      {casaCierre ? (
        <Link href={`/panel/propiedades/${casaCierre.id}`} className="fc-interes fc-cierre-casa">
          {casa}
        </Link>
      ) : (
        <p className="fc-cierre-sin-casa suave">
          Sin casa anotada
          {c.cierre_at ? ` · ${diaLargo(new Date(c.cierre_at), zona)}` : ""}
        </p>
      )}
      <TablaContable filas={cuenta.filas} moneda={moneda} titulo="Cuenta del cierre" className="fc-cierre-cuenta" />
      <p className="fc-cierre-nota">
        {cuenta.comisionEstimada ? "La comisión no se anotó: es la estimada con tu regla. " : ""}
        El IVA es un estimado (13 % sobre servicios): confírmalo con tu contador.
      </p>
      {datos.length > 0 && (
        <dl className="fc-cierre-datos">
          {datos.map((d) => (
            <div key={d.k} className={d.tono ? `cont-dato-${d.tono}` : undefined}>
              <dt>{d.k}</dt>
              <dd>{d.v}</dd>
            </div>
          ))}
        </dl>
      )}
      <details className="fc-editar">
        <summary>Cambiar el cierre</summary>
        <FormularioCierre
          c={c}
          prefijo="cambio"
          alquiler={cuenta.alquiler}
          operacion={operacion}
          comisionPct={comisionPct}
          todas={todas}
          casaId={casaCierre?.id ?? ""}
          precio={precioFinal}
          moneda={moneda}
          comision={c.cierre_comision}
          boton="Guardar el cambio"
        />
      </details>
    </>
  );
}

function SelectorMoneda({ name, defecto }: { name: string; defecto: string }) {
  return (
    <select name={name} aria-label="Moneda" defaultValue={defecto}>
      <option value="USD">Dólares</option>
      <option value="CRC">Colones</option>
    </select>
  );
}

function AnotarCierre({ c, juego, casaInteres, todas, comisionPct }: Comun) {
  return (
    <FormularioCierre
      formId="cierre"
      titulo="¡Cerró! Anota cómo fue"
      c={c}
      prefijo="cierre"
      alquiler={juego.alquiler}
      operacion={juego.operacion}
      comisionPct={comisionPct}
      todas={todas}
      casaId={casaInteres?.id ?? ""}
      precio={c.oferta_monto ?? casaInteres?.precio ?? null}
      moneda={juego.moneda}
      comision={null}
      boton="Guardar el cierre"
    />
  );
}

/** Casa, precio, moneda y comisión del cierre (guardarCierre): para anotarlo o, ya cerrado, corregirlo. */
function FormularioCierre(p: {
  formId?: string;
  titulo?: string;
  c: Pick<Negocio, "id">;
  prefijo: string;
  alquiler: boolean;
  operacion: string | null;
  comisionPct: number;
  todas: CasaCorta[];
  casaId: string;
  precio: number | null;
  moneda: string;
  comision: number | null;
  boton: string;
}) {
  const id = (k: string) => `${p.prefijo}-${k}`;
  return (
    <form action={guardarCierre} className="fc-form" id={p.formId}>
      {p.titulo && <h2>{p.titulo}</h2>}
      <input type="hidden" name="id" value={p.c.id} />
      <label htmlFor={id("casa")}>Casa</label>
      <select id={id("casa")} name="casa" defaultValue={p.casaId}>
        <option value="">Ninguna de mis casas</option>
        {p.todas.map((casa) => (
          <option key={casa.id} value={casa.id}>
            {casa.titulo}
          </option>
        ))}
      </select>
      <label htmlFor={id("precio")}>{p.alquiler ? "Renta mensual" : "Precio final"}</label>
      <div className="fc-monto">
        <input id={id("precio")} name="precio" type="text" inputMode="decimal" required defaultValue={p.precio ?? ""} />
        <SelectorMoneda name="moneda" defecto={p.moneda} />
      </div>
      <label htmlFor={id("comision")}>Tu comisión (vacía: {reglaComision(p.comisionPct, p.operacion)})</label>
      <input
        id={id("comision")}
        name="comision"
        type="text"
        inputMode="decimal"
        defaultValue={p.comision ?? ""}
        placeholder={p.alquiler ? "Un mes de renta" : `${p.comisionPct}% del precio`}
      />
      <button type="submit" className="primario">
        {p.boton}
      </button>
    </form>
  );
}

function EnJuegoAhora({ c, juego, casaInteres, todas, comisionPct }: Comun) {
  return (
    <>
      <div className="fc-bloque-cabeza">
        <h2>Lo que está en juego</h2>
      </div>
      {casaInteres && <CasaInteres casa={casaInteres} />}
      {juego.valor > 0 && (
        <TablaContable
          className="fc-juego-cuenta"
          titulo="Lo que está en juego"
          moneda={juego.moneda}
          filas={cuentaEnJuego({
            valor: juego.valor,
            moneda: juego.moneda,
            hayOferta: !!c.oferta_monto,
            alquiler: juego.alquiler,
            comision: juego.comision,
            regla: reglaComision(comisionPct, juego.operacion),
            casa: casaInteres ? { precio: casaInteres.precio, moneda: casaInteres.moneda } : null,
          })}
        />
      )}
      <details className="fc-editar" open={!casaInteres && !c.oferta_monto}>
        <summary>{casaInteres || c.oferta_monto ? "Cambiar la casa o la oferta" : "Anotar la casa o la oferta"}</summary>
        <form action={guardarOportunidad} className="fc-form">
          <input type="hidden" name="id" value={c.id} />
          <label htmlFor="op-casa">Casa que le interesa</label>
          <select id="op-casa" name="casa" defaultValue={casaInteres?.id ?? ""}>
            <option value="">Todavía ninguna</option>
            {todas
              .filter((p) => p.estado === "activa" || p.id === casaInteres?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                  {p.precio ? ` · ${precio(p.precio, p.moneda)}` : ""}
                </option>
              ))}
          </select>
          <label htmlFor="op-oferta">{juego.alquiler ? "Renta que ofrece (al mes)" : "Oferta del cliente"}</label>
          <div className="fc-monto">
            <input id="op-oferta" name="oferta" type="text" inputMode="numeric" defaultValue={c.oferta_monto ?? ""} placeholder="Si hizo una" />
            <SelectorMoneda name="oferta_moneda" defecto={juego.moneda} />
          </div>
          <button type="submit" className="primario">
            Guardar
          </button>
        </form>
      </details>
    </>
  );
}

function CasaInteres({ casa }: { casa: CasaCorta }) {
  return (
    <Link href={`/panel/propiedades/${casa.id}`} className="fc-interes">
      <FotoCasa fotos={casa.fotos} tamano={28} />
      <span>
        <small>Le interesa</small>
        <strong>{casa.titulo}</strong>
        {casa.precio ? <span className="suave">{precio(casa.precio, casa.moneda)}</span> : null}
      </span>
    </Link>
  );
}
