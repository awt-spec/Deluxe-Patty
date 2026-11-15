"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { almacenSesion, leerAlmacen } from "@/lib/panel/almacen";
import { campoGuardable, claveBorrador, mismosValores, paraGuardar, validarBorrador, validarTextoGuardado, type Valores } from "@/lib/panel/borrador";

// Lo escrito en un formulario no se pierde: se guarda en esta pestaña (sessionStorage) mientras se escribe y se repone
// al volver (después de entrar de nuevo, de recargar o de la pantalla de error). Se borra cuando la acción termina
// bien. Y sin conexión no se manda: el formulario queda como estaba y se dice "Sin conexión. No se guardó todavía.".
//
// Se pone DENTRO del <form action={…}> (junto al botón de guardar); funciona con formularios sin estado de React
// (defaultValue). Nunca guarda contraseñas, archivos ni campos ocultos (lib/panel/borrador.ts).

type Campo = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function campos(form: HTMLFormElement): Campo[] {
  return Array.from(form.elements).filter(
    (e): e is Campo =>
      (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement) &&
      campoGuardable({ name: e.name, type: e.type, disabled: e.disabled, sinBorrador: e.hasAttribute("data-sin-borrador") }),
  );
}

function leerValores(form: HTMLFormElement): Valores {
  const v: Valores = {};
  for (const c of campos(form)) {
    const lista = (v[c.name] ??= []);
    if (c instanceof HTMLInputElement && (c.type === "checkbox" || c.type === "radio")) {
      if (c.checked) lista.push(c.value);
    } else if (c instanceof HTMLSelectElement && c.multiple) {
      for (const o of Array.from(c.selectedOptions)) lista.push(o.value);
    } else lista.push(c.value);
  }
  return v;
}

function ponerValores(form: HTMLFormElement, v: Valores) {
  const vistos: Record<string, number> = {};
  for (const c of campos(form)) {
    const lista = v[c.name];
    if (!lista) continue;
    if (c instanceof HTMLInputElement && (c.type === "checkbox" || c.type === "radio")) c.checked = lista.includes(c.value);
    else if (c instanceof HTMLSelectElement && c.multiple) for (const o of Array.from(c.options)) o.selected = lista.includes(o.value);
    else {
      const i = (vistos[c.name] = (vistos[c.name] ?? -1) + 1);
      if (lista[i] !== undefined) c.value = lista[i];
    }
  }
}

function guardar(clave: string, v: Valores, base: Valores) {
  const s = almacenSesion();
  try {
    if (mismosValores(v, base)) s?.removeItem(clave);
    else s?.setItem(clave, JSON.stringify(paraGuardar(v)));
  } catch {
    // Almacén lleno o bloqueado: se sigue sin borrador (el formulario funciona igual).
  }
}

function borrar(clave: string) {
  try {
    almacenSesion()?.removeItem(clave);
  } catch {
    // Sin almacén no hay borrador que borrar.
  }
}

/** `nombre`: único por pantalla (con el id si hay varios formularios iguales, p. ej. una respuesta por duda). */
export function ConservarBorrador({ nombre }: { nombre: string }) {
  const ancla = useRef<HTMLSpanElement>(null);
  const ruta = usePathname();
  const clave = claveBorrador(ruta, nombre);
  const { pending } = useFormStatus();
  const [repuesto, setRepuesto] = useState(false);
  const [sinRed, setSinRed] = useState(false);
  const enviado = useRef(false);
  const antes = useRef(false);
  const base = useRef<Valores>({});

  useEffect(() => {
    const form = ancla.current?.closest("form");
    if (!form) return;
    // Lo que la página trae (lo guardado en la base): si el borrador es igual, no hay nada que reponer.
    base.current = leerValores(form);
    const guardado = leerAlmacen(almacenSesion(), clave, (x) => validarBorrador(x));
    if (guardado && !mismosValores(guardado.v, base.current)) {
      ponerValores(form, guardado.v);
      setRepuesto(true);
    } else if (guardado) borrar(clave);

    const alEscribir = () => guardar(clave, leerValores(form), base.current);
    // En captura, antes que React: sin red, el envío no llega a la acción (ni a la pantalla de error).
    const alEnviar = (e: Event) => {
      guardar(clave, leerValores(form), base.current);
      if (navigator.onLine === false) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSinRed(true);
        return;
      }
      setSinRed(false);
      enviado.current = true;
    };
    const enLinea = () => setSinRed(false);
    form.addEventListener("input", alEscribir);
    form.addEventListener("change", alEscribir);
    form.addEventListener("submit", alEnviar, { capture: true });
    window.addEventListener("online", enLinea);
    return () => {
      form.removeEventListener("input", alEscribir);
      form.removeEventListener("change", alEscribir);
      form.removeEventListener("submit", alEnviar, { capture: true });
      window.removeEventListener("online", enLinea);
    };
  }, [clave]);

  // La acción terminó con la página en pie (si falla, la pantalla de error desmonta el formulario, y si la sesión se
  // cerró, el navegador se va a /entrar): se guardó, el borrador ya no hace falta.
  useEffect(() => {
    if (antes.current && !pending && enviado.current) {
      enviado.current = false;
      borrar(clave);
      setRepuesto(false);
    }
    antes.current = pending;
  }, [pending, clave]);

  const descartar = () => {
    const form = ancla.current?.closest("form");
    borrar(clave);
    form?.reset();
    setRepuesto(false);
  };

  return (
    <span ref={ancla} className="borrador-ancla">
      {repuesto && (
        <span className="borrador-aviso" role="status">
          Te dejé lo que habías escrito y no se guardó.{" "}
          <button type="button" className="enlace-boton" onClick={descartar}>
            Descartar
          </button>
        </span>
      )}
      {sinRed && (
        <span className="borrador-sin-red" role="alert">
          Sin conexión. No se guardó todavía.
        </span>
      )}
    </span>
  );
}

/**
 * Lo mismo para un texto con estado de React (`value` + `onChange`): lo repone al montar, lo guarda al cambiar y se
 * borra solo cuando queda vacío (al guardar con éxito el componente lo vacía) o con la función que devuelve.
 */
export function useBorradorTexto(nombre: string, valor: string, poner: (v: string) => void): () => void {
  const ruta = usePathname();
  const clave = claveBorrador(ruta, nombre);
  const listo = useRef(false);
  // Mientras se repone lo guardado, el primer valor (vacío) no lo borra.
  const reponiendo = useRef<string | null>(null);
  const ponerRef = useRef(poner);
  useEffect(() => {
    ponerRef.current = poner;
  });

  useEffect(() => {
    const g = leerAlmacen(almacenSesion(), clave, (x) => validarTextoGuardado(x));
    if (g) {
      reponiendo.current = g;
      ponerRef.current(g);
    }
    listo.current = true;
  }, [clave]);

  useEffect(() => {
    if (!listo.current) return;
    if (reponiendo.current !== null) {
      if (valor !== reponiendo.current) return;
      reponiendo.current = null;
    }
    const s = almacenSesion();
    try {
      if (valor.trim()) s?.setItem(clave, JSON.stringify({ t: Date.now(), texto: valor }));
      else s?.removeItem(clave);
    } catch {
      // Almacén lleno o bloqueado: el campo funciona igual, solo no se recuerda.
    }
  }, [valor, clave]);

  return useCallback(() => borrar(clave), [clave]);
}

/** ¿Hay red? Para frenar un envío antes de mandarlo (el chat, Apartar tiempo). */
export function sinConexion(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
