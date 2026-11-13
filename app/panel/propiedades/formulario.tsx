"use client";

import { useActionState } from "react";
import { ESTADOS, ETIQUETA_ESTADO, ETIQUETA_TIPO, MONEDAS, OPERACIONES, TIPOS } from "@/lib/panel/formularios";
import type { EstadoFormulario } from "./acciones";
import { SeccionForm } from "./seccion-form";
import "./formulario-movil.css";

export type PropiedadFormulario = {
  id?: string;
  codigo: string;
  titulo: string;
  tipo: string;
  operacion: string;
  precio: number | null;
  moneda: string;
  provincia: string | null;
  canton: string | null;
  distrito: string | null;
  zona: string | null;
  habitaciones: number | null;
  banos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  descripcion: string | null;
  amenidades: string[];
  url_e24: string | null;
  estado: string;
};

const numero = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="pila" style={{ flex: 1, minWidth: 0 }}>
      <label htmlFor={id}>{etiqueta}</label>
      {children}
    </div>
  );
}

/** Ficha de la propiedad: lo que la asistente puede decirle a un cliente sale solo de aquí. */
export function FormularioPropiedad({
  p,
  accion,
  boton,
}: {
  p: PropiedadFormulario;
  accion: (previo: EstadoFormulario, f: FormData) => Promise<EstadoFormulario>;
  boton: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, null);
  // Si la acción devolvió un motivo, el formulario se vuelve a armar con lo que se había escrito.
  const d = estado?.datos;
  const v = (k: keyof PropiedadFormulario, valor: string) => (d ? (d[k] ?? "") : valor);
  return (
    <form action={enviar} className="pila form-casa" key={JSON.stringify(d ?? null)}>
      {estado && (
        <p className="aviso" role="alert">
          {estado.motivo}
        </p>
      )}
      {p.id && <input type="hidden" name="id" value={p.id} />}
      {/* En el teléfono cada parte se pliega con su resumen; en computadora se ve todo como siempre. */}
      <SeccionForm titulo="Lo básico" abierta>
      <div className="fila campos">
        <Campo id="codigo" etiqueta="Código">
          <input id="codigo" name="codigo" type="text" required defaultValue={v("codigo", p.codigo)} autoCapitalize="characters" enterKeyHint="next" />
        </Campo>
        <Campo id="estado" etiqueta="Estado">
          <select id="estado" name="estado" defaultValue={v("estado", p.estado)}>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo id="titulo" etiqueta="Título">
        <input id="titulo" name="titulo" type="text" required defaultValue={v("titulo", p.titulo)} placeholder="Casa en condominio en San Rafael de Escazú" enterKeyHint="next" />
      </Campo>
      <div className="fila campos">
        <Campo id="tipo" etiqueta="Tipo">
          <select id="tipo" name="tipo" defaultValue={v("tipo", p.tipo)}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="operacion" etiqueta="Operación">
          <select id="operacion" name="operacion" defaultValue={v("operacion", p.operacion)}>
            {OPERACIONES.map((o) => (
              <option key={o} value={o}>
                {o === "venta" ? "Venta" : "Alquiler"}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      </SeccionForm>
      <SeccionForm titulo="Precio">
      <div className="fila campos">
        <Campo id="precio" etiqueta={p.operacion === "alquiler" ? "Precio por mes" : "Precio"}>
          <input id="precio" name="precio" type="text" inputMode="decimal" defaultValue={v("precio", numero(p.precio))} placeholder="450000" enterKeyHint="next" />
        </Campo>
        <Campo id="moneda" etiqueta="Moneda">
          <select id="moneda" name="moneda" defaultValue={v("moneda", p.moneda)}>
            {MONEDAS.map((m) => (
              <option key={m} value={m}>
                {m === "USD" ? "Dólares" : "Colones"}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      </SeccionForm>

      <SeccionForm titulo="Ubicación">
      <h2 className="solo-computadora">Ubicación</h2>
      <div className="fila campos">
        <Campo id="provincia" etiqueta="Provincia">
          <input id="provincia" name="provincia" type="text" defaultValue={v("provincia", p.provincia ?? "")} placeholder="San José" enterKeyHint="next" />
        </Campo>
        <Campo id="canton" etiqueta="Cantón">
          <input id="canton" name="canton" type="text" defaultValue={v("canton", p.canton ?? "")} placeholder="Escazú" enterKeyHint="next" />
        </Campo>
      </div>
      <div className="fila campos">
        <Campo id="distrito" etiqueta="Distrito">
          <input id="distrito" name="distrito" type="text" defaultValue={v("distrito", p.distrito ?? "")} placeholder="San Rafael" enterKeyHint="next" />
        </Campo>
        <Campo id="zona" etiqueta="Zona (como la buscan)">
          <input id="zona" name="zona" type="text" defaultValue={v("zona", p.zona ?? "")} placeholder="Escazú" enterKeyHint="next" />
        </Campo>
      </div>
      </SeccionForm>

      <SeccionForm titulo="Medidas">
      <h2 className="solo-computadora">Características</h2>
      <div className="fila campos">
        <Campo id="habitaciones" etiqueta="Habitaciones">
          <input id="habitaciones" name="habitaciones" type="text" inputMode="numeric" defaultValue={v("habitaciones", numero(p.habitaciones))} placeholder="3" enterKeyHint="next" />
        </Campo>
        <Campo id="banos" etiqueta="Baños">
          <input id="banos" name="banos" type="text" inputMode="decimal" defaultValue={v("banos", numero(p.banos))} placeholder="2,5" enterKeyHint="next" />
        </Campo>
      </div>
      <div className="fila campos">
        <Campo id="m2_construccion" etiqueta="m² construcción">
          <input id="m2_construccion" name="m2_construccion" type="text" inputMode="decimal" defaultValue={v("m2_construccion", numero(p.m2_construccion))} placeholder="220" enterKeyHint="next" />
        </Campo>
        <Campo id="m2_terreno" etiqueta="m² terreno">
          <input id="m2_terreno" name="m2_terreno" type="text" inputMode="decimal" defaultValue={v("m2_terreno", numero(p.m2_terreno))} placeholder="400" enterKeyHint="next" />
        </Campo>
      </div>
      </SeccionForm>
      <SeccionForm titulo="Detalles">
      <Campo id="amenidades" etiqueta="Amenidades (una por línea)">
        <textarea id="amenidades" name="amenidades" rows={4} defaultValue={v("amenidades", p.amenidades.join("\n"))} placeholder={"piscina\nseguridad 24/7\ndos parqueos techados"} />
      </Campo>
      <Campo id="descripcion" etiqueta="Descripción">
        <textarea id="descripcion" name="descripcion" rows={6} defaultValue={v("descripcion", p.descripcion ?? "")} />
      </Campo>
      <p className="suave">
        La asistente solo dice lo que está en esta ficha. Lo que no esté (cuota, mascotas, año…) lo confirma contigo.
      </p>
      <Campo id="url_e24" etiqueta="Enlace en Encuentra24 (si ya está publicada)">
        <input id="url_e24" name="url_e24" type="url" defaultValue={v("url_e24", p.url_e24 ?? "")} placeholder="https://www.encuentra24.com/…" enterKeyHint="done" />
      </Campo>
      </SeccionForm>
      <div className="form-casa-guardar">
        <button type="submit" className="primario" disabled={enviando}>
          {enviando ? "Guardando…" : boton}
        </button>
      </div>
    </form>
  );
}
