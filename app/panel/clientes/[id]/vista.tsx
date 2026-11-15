import { Aviso } from "../../aviso";
import { Volver } from "../../volver";
import { Camino } from "./ficha/camino";
import { Cabecera } from "./ficha/cabecera";
import { CasasQueEncajan } from "./ficha/casas";
import { CifrasCliente } from "./ficha/cifras";
import { LoQueEstaEnJuego } from "./ficha/en-juego";
import { PlegadosDelFinal } from "./ficha/final";
import { Notas } from "./ficha/notas";
import { AvisoParecido } from "./ficha/parecido";
import { QueBusca } from "./ficha/busca";
import { Recordatorio } from "./ficha/recordatorio";
import {
  casasDeFicha,
  cifraDinero,
  contarVisitas,
  datosBusca,
  enJuego,
  entradaQueSigue,
  estaActivo,
  fechasFicha,
  nombreCliente,
  sabeQueBusca,
} from "./ficha/reglas";
import { SeccionQueSigue } from "./ficha/sigue";
import type { DatosFicha } from "./ficha/tipos";
import { Historia } from "./historia";
import { OcultarAlBajar } from "./movil";
import { queSigue } from "./que-sigue";

// Ficha de un cliente, solo forma: la página lee los datos (con la sesión del corredor) y los pasa aquí.
// Arriba quién es y las acciones; luego "Qué sigue", cifras, el camino por etapas y la historia; al lado
// (en computadora) lo que se edita: recordatorio, lo que está en juego, qué busca, casas y notas.
// Cada sección está en ficha/*.tsx y lo que decide qué mostrar, en ficha/reglas.ts.

export type { CasaCorta, CasaFicha, ClienteFicha, DatosFicha, OtroCliente } from "./ficha/tipos";

export function FichaCliente(d: DatosFicha) {
  const { c, zona, ahora } = d;
  const id = c.id;
  const busca = c.busca ?? {};
  const asistente = d.nombreAsistente;
  const f = fechasFicha(c, ahora, zona);
  const juego = enJuego(c, d.casaInteres, d.comisionPct);
  const conoceBusca = sabeQueBusca(busca);
  const { hechas, proximas } = contarVisitas(d.visitas, ahora);

  return (
    <div className="fc-ficha">
      <Volver href="/panel/clientes" texto="Clientes" />
      <Aviso texto={d.aviso} />

      <Cabecera
        c={c}
        nombre={nombreCliente(c)}
        conversacionId={d.conversacionId}
        llego={f.llego}
        diasCliente={f.diasCliente}
        operacion={juego.operacion}
        alquiler={juego.alquiler}
        anuncio={d.anuncio}
        vinoDelSitio={d.vinoDelSitio}
        asistente={asistente}
      />

      <AvisoParecido id={id} parecidos={d.parecidos} />

      <OcultarAlBajar selector=".fc-acciones" />
      <div className="fc-grid">
        <div className="fc-principal">
          <SeccionQueSigue sigue={queSigue(entradaQueSigue(d, conoceBusca))} />
          <CifrasCliente
            etapa={c.etapa}
            activo={estaActivo(c.etapa)}
            diasCliente={f.diasCliente}
            diasSinMovimiento={d.diasSinMovimiento}
            hechas={hechas}
            proximas={proximas}
            dinero={cifraDinero(c, d.casaInteres, juego.alquiler)}
          />
          <Camino id={id} etapa={c.etapa} diasEnEtapa={f.diasEnEtapa} motivoPerdida={c.motivo_perdida} />
          <Historia eventos={d.eventos} contactoId={id} ahora={ahora} zona={zona} nombreAsistente={asistente} />
        </div>

        {/* Lo que se edita */}
        <aside className="fc-lateral">
          <Recordatorio id={id} fecha={c.seguimiento_fecha} nota={c.seguimiento_nota} hoy={f.hoy} manana={f.manana} />
          <LoQueEstaEnJuego c={c} juego={juego} casaInteres={d.casaInteres} casaCierre={d.casaCierre} todas={d.todas} comisionPct={d.comisionPct} zona={zona} />
          <QueBusca id={id} busca={busca} datos={datosBusca(busca)} asistente={asistente} />
          <CasasQueEncajan casas={casasDeFicha(d.casaInteres, d.casasEncajan)} sabeQueBusca={conoceBusca} />
          <Notas id={id} nombre={c.nombre} notas={c.notas} />
        </aside>
      </div>

      {/* Lo de poco uso, plegado al final */}
      <PlegadosDelFinal id={id} etapa={c.etapa} otros={d.otros} />
    </div>
  );
}
