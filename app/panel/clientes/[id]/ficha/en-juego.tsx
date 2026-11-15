import Link from "next/link";
import { diaLargo } from "@/lib/agenda/formato";
import { monedaDe, montoExacto, reglaComision } from "@/lib/crm/dinero";
import { precio } from "@/lib/formato";
import { guardarCierre, guardarOportunidad } from "../../acciones";
import { SeccionPlegable } from "../movil";
import { FotoCasa } from "./foto-casa";
import { juegoAbierto, modoJuego, resumenJuego, type EnJuego } from "./reglas";
import type { CasaCorta, ClienteFicha } from "./tipos";

// "Lo que está en juego" (#juego): según la etapa, el cierre ya anotado, el formulario para anotarlo o la casa que le
// interesa y la oferta con la comisión estimada.

type Negocio = Pick<ClienteFicha, "id" | "etapa" | "oferta_monto" | "cierre_precio" | "cierre_comision" | "cierre_moneda" | "cierre_at">;

type Comun = { c: Negocio; juego: EnJuego; casaInteres: CasaCorta | null; todas: CasaCorta[]; comisionPct: number };

export function LoQueEstaEnJuego(p: Comun & { casaCierre: CasaCorta | null; zona: string }) {
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
      {modo === "cerro" ? <Cerro c={c} casaCierre={p.casaCierre} zona={p.zona} /> : modo === "anotar-cierre" ? <AnotarCierre {...p} /> : <EnJuegoAhora {...p} />}
    </SeccionPlegable>
  );
}

function Cerro({ c, casaCierre, zona }: { c: Negocio; casaCierre: CasaCorta | null; zona: string }) {
  const moneda = monedaDe(c.cierre_moneda);
  return (
    <>
      <div className="fc-bloque-cabeza">
        <h2>Cerró</h2>
        {c.cierre_at && <span className="suave">{diaLargo(new Date(c.cierre_at), zona)}</span>}
      </div>
      <div className="fc-cierre">
        <span className="fc-cierre-casa">{casaCierre ? casaCierre.titulo : "Sin casa anotada"}</span>
        <strong className="fc-cierre-precio">{montoExacto(Number(c.cierre_precio), moneda)}</strong>
        <span className="fc-comision">Tu comisión: {montoExacto(Number(c.cierre_comision ?? 0), moneda)}</span>
      </div>
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
    <form action={guardarCierre} className="fc-form" id="cierre">
      <h2>¡Cerró! Anota cómo fue</h2>
      <input type="hidden" name="id" value={c.id} />
      <label htmlFor="cierre-casa">Casa</label>
      <select id="cierre-casa" name="casa" defaultValue={casaInteres?.id ?? ""}>
        <option value="">Ninguna de mis casas</option>
        {todas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.titulo}
          </option>
        ))}
      </select>
      <label htmlFor="cierre-precio">{juego.alquiler ? "Renta mensual" : "Precio final"}</label>
      <div className="fc-monto">
        <input id="cierre-precio" name="precio" type="text" inputMode="numeric" required defaultValue={c.oferta_monto ?? casaInteres?.precio ?? ""} />
        <SelectorMoneda name="moneda" defecto={juego.moneda} />
      </div>
      <label htmlFor="cierre-comision">Tu comisión (vacía: {reglaComision(comisionPct, juego.operacion)})</label>
      <input id="cierre-comision" name="comision" type="text" inputMode="numeric" placeholder={juego.alquiler ? "Un mes de renta" : `${comisionPct}% del precio`} />
      <button type="submit" className="primario">
        Guardar el cierre
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
        <p className="fc-comision-estimada">
          {c.oferta_monto ? "Ofreció" : "Vale"} <strong>{montoExacto(juego.valor, juego.moneda)}</strong>
          {juego.alquiler ? " al mes" : ""} · tu comisión <strong>{montoExacto(juego.comision, juego.moneda)}</strong>{" "}
          <span>({reglaComision(comisionPct, juego.operacion)})</span>
        </p>
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
