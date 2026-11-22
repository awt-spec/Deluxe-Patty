// "Llenar con Patty" (desde la 1.6.0): corre en la pestaña del formulario de publicar de Encuentra24, en el mundo aislado
// de la extensión (la página no lo ve ni lo puede llamar). Lo inyecta background.js con scripting.executeScript
// después de campos.js, solo cuando la persona lo pide desde el panel lateral.
//
// Escribe en los campos que reconoce y adjunta las fotos al campo de archivos. Nunca envía el formulario ni toca un
// botón: la persona revisa todo y publica ella misma. No usa la API de la extensión ni la red: las fotos le llegan ya bajadas.
// Deja en `self.LlenarPatty`: llenar(datos) → informe, agregarFoto(foto), adjuntarFotos() → informe de fotos, olvidarFotos().
(() => {
  if (self.LlenarPatty) return;
  const C = self.CamposPatty;
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const corto = (t, max = 120) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const fueraDelFormulario = (el) => !!el.closest('header, nav, footer, [role="search"], [role="navigation"]');

  /** El texto que nombra al campo: su <label>, aria-labelledby o, si no, el texto corto que va justo antes. */
  function etiquetaDe(el) {
    const partes = [];
    for (const l of el.labels ?? []) partes.push(l.innerText);
    for (const id of (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)) {
      const x = document.getElementById(id);
      if (x) partes.push(x.innerText);
    }
    if (!corto(partes.join(" "))) {
      const envoltura = el.closest("label");
      if (envoltura) partes.push(envoltura.innerText);
    }
    let n = el;
    for (let i = 0; i < 3 && n && !corto(partes.join(" ")); i++) {
      for (let h = n.previousElementSibling; h && !corto(partes.join(" ")); h = h.previousElementSibling) {
        const t = corto(h.innerText, 200);
        if (t && t.length <= 60 && !h.querySelector("input, select, textarea")) partes.push(t);
      }
      n = n.parentElement;
    }
    return corto(partes.join(" "));
  }

  /** Los campos del formulario, con lo que dicen, en el orden de la página. Los radios van agrupados por name. */
  function recorrer() {
    const controles = [];
    const descriptores = [];
    const casillas = [];
    const grupos = new Map();
    const todos = document.querySelectorAll('input, select, textarea, [contenteditable=""], [contenteditable="true"]');
    for (const el of todos) {
      if (fueraDelFormulario(el) || el.disabled || el.readOnly) continue;
      const tag = el.tagName.toLowerCase();
      const tipoInput = tag === "input" ? (el.getAttribute("type") ?? "text").toLowerCase() : "";
      if (tipoInput === "file") continue;
      if (!visible(el) && tipoInput !== "radio" && tipoInput !== "checkbox") continue;
      const base = { etiqueta: etiquetaDe(el), aria: el.getAttribute("aria-label") ?? "", placeholder: el.getAttribute("placeholder") ?? "", nombre: `${el.getAttribute("name") ?? ""} ${el.id ?? ""}` };
      if (tipoInput === "checkbox") {
        casillas.push({ el, etiqueta: base.etiqueta || base.aria });
        continue;
      }
      if (tipoInput === "radio") {
        const nombre = el.getAttribute("name") || el.id;
        let g = grupos.get(nombre);
        if (!g) {
          const fs = el.closest("fieldset");
          const leyenda = fs?.querySelector("legend")?.innerText ?? "";
          g = { radios: [], d: { tipo: "radio", etiqueta: corto(leyenda) || etiquetaDe(el.closest("[role=radiogroup]") ?? fs ?? el.parentElement ?? el), aria: "", placeholder: "", nombre: base.nombre, opciones: [], vacio: true } };
          grupos.set(nombre, g);
          controles.push(g);
          descriptores.push(g.d);
        }
        g.radios.push(el);
        g.d.opciones.push(base.etiqueta || el.value);
        if (el.checked) g.d.vacio = false;
        continue;
      }
      if (tag === "select") {
        if (el.multiple) continue;
        const opciones = [...el.options].map((o) => corto(o.text));
        const elegida = el.options[el.selectedIndex];
        controles.push({ el });
        descriptores.push({ tipo: "select", ...base, opciones, vacio: !elegida || el.selectedIndex <= 0 || elegida.value === "" });
        continue;
      }
      if (tag === "textarea") {
        controles.push({ el });
        descriptores.push({ tipo: "area", ...base, vacio: !el.value.trim() });
        continue;
      }
      if (tag !== "input") {
        // Solo la raíz de un contenteditable (no sus hijos).
        if (!el.isContentEditable || el.parentElement?.isContentEditable) continue;
        controles.push({ el });
        descriptores.push({ tipo: "editable", ...base, vacio: !corto(el.innerText) });
        continue;
      }
      const tipo = tipoInput === "number" ? "numero" : tipoInput === "text" || tipoInput === "" ? "texto" : tipoInput;
      controles.push({ el });
      descriptores.push({ tipo, ...base, vacio: !el.value.trim() });
    }
    return { controles, descriptores, casillas };
  }

  const avisar = (el, tipos = ["input", "change"]) => {
    for (const t of tipos) el.dispatchEvent(new Event(t, { bubbles: true }));
  };

  /** Escribe como lo haría el teclado para los formularios de React: con el setter propio del elemento y sus eventos. */
  function escribir(el, valor) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, valor);
    else el.value = valor;
    avisar(el);
    el.dispatchEvent(new FocusEvent("blur"));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    return el.value === valor || el.value.replace(/\s+/g, "") === valor.replace(/\s+/g, "");
  }

  /** Un editor de texto enriquecido (contenteditable): se reemplaza su contenido como si se pegara. */
  function escribirEditable(el, valor) {
    el.focus();
    const sel = getSelection();
    const rango = document.createRange();
    rango.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(rango);
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, valor);
    } catch {
      ok = false;
    }
    if (!ok || !corto(el.innerText)) {
      el.textContent = valor;
      avisar(el, ["input"]);
    }
    el.dispatchEvent(new FocusEvent("blur"));
    return !!corto(el.innerText);
  }

  function aplicar(control, accion) {
    if ("opcion" in accion) {
      if (control.radios) {
        const r = control.radios[accion.opcion];
        if (!r) return false;
        r.checked = true;
        avisar(r);
        return r.checked;
      }
      const el = control.el;
      const op = el.options[accion.opcion];
      if (!op) return false;
      el.selectedIndex = accion.opcion;
      el.value = op.value;
      avisar(el);
      return el.selectedIndex === accion.opcion;
    }
    return control.el.isContentEditable && !("value" in control.el) ? escribirEditable(control.el, accion.valor) : escribir(control.el, accion.valor);
  }

  /** La verificación de Cloudflare en vez del formulario: no se toca nada. */
  const esDesafio = () =>
    !!document.querySelector('script[src*="challenge-platform"], #challenge-form, #cf-challenge-running, iframe[src*="turnstile"]') || /just a moment/i.test(document.title);

  /**
   * Llena lo que reconoce. Las listas que dependen de otra (cantón después de provincia) cargan sus opciones un rato
   * después: lo que quedó sin opción o sin campo se vuelve a intentar dos veces, con una pausa.
   */
  async function llenar(datos) {
    if (esDesafio()) return { desafio: true };
    const llenados = [];
    const yaTenian = new Set();
    let pendientes = null;
    let ultimo = { faltan: [], sinOpcion: [] };
    let campos = 0;
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      if (vuelta > 0) await esperar(900);
      const { controles, descriptores } = recorrer();
      campos = Math.max(campos, descriptores.length);
      const plan = C.planear(descriptores, datos, pendientes);
      for (const a of plan.acciones) {
        try {
          if (aplicar(controles[a.indice], a)) llenados.push(a.clave);
          else plan.faltan.push(a.clave);
        } catch {
          plan.faltan.push(a.clave);
        }
      }
      for (const k of plan.yaTenian) yaTenian.add(k);
      ultimo = plan;
      pendientes = [...new Set([...plan.faltan, ...plan.sinOpcion])];
      if (pendientes.length === 0) break;
    }
    // Amenidades: solo se marcan casillas sin marcar.
    let amenidades = 0;
    const { casillas } = recorrer();
    for (const i of C.marcarAmenidades(casillas.map((c) => c.etiqueta), datos?.amenidades)) {
      const el = casillas[i].el;
      if (el.checked) continue;
      el.checked = true;
      avisar(el);
      if (el.checked) amenidades++;
    }
    return {
      desafio: false,
      campos,
      llenados: [...new Set(llenados)],
      faltan: [...new Set([...ultimo.faltan, ...ultimo.sinOpcion])].filter((k) => !llenados.includes(k) && !yaTenian.has(k)),
      yaTenian: [...yaTenian].filter((k) => !llenados.includes(k)),
      amenidades,
      archivo: !!campoDeFotos(),
    };
  }

  // --- Fotos --------------------------------------------------------------------------------------------------

  let fotos = [];

  /** El campo de archivos para las fotos: el que acepta imágenes (o cualquier archivo), mejor si acepta varias. */
  function campoDeFotos() {
    const campos = [...document.querySelectorAll('input[type="file"]')].filter((i) => !i.disabled && !fueraDelFormulario(i));
    const imagenes = campos.filter((i) => !i.accept || /image|jpe?g|png|webp/i.test(i.accept));
    return imagenes.find((i) => i.multiple) ?? imagenes[0] ?? null;
  }

  /** Una foto ya bajada por la extensión: { nombre, tipo, b64 }. */
  function agregarFoto(f) {
    if (!f || typeof f.b64 !== "string" || !/^image\/(jpeg|png|webp)$/.test(f.tipo ?? "")) return fotos.length;
    const bin = atob(f.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    fotos.push(new File([bytes], corto(f.nombre, 80) || `foto-${fotos.length + 1}.jpg`, { type: f.tipo }));
    return fotos.length;
  }

  function olvidarFotos() {
    fotos = [];
  }

  /** Pone las fotos en el campo de archivos, en orden. Si recibe una sola, la primera (la portada). */
  function adjuntarFotos() {
    const listas = fotos;
    fotos = [];
    if (listas.length === 0) return { adjuntadas: 0, sinCampo: false, unaSola: false };
    const campo = campoDeFotos();
    if (!campo) return { adjuntadas: 0, sinCampo: true, unaSola: false };
    const dt = new DataTransfer();
    const van = campo.multiple ? listas : listas.slice(0, 1);
    for (const f of van) dt.items.add(f);
    campo.files = dt.files;
    avisar(campo);
    return { adjuntadas: campo.files?.length ?? 0, sinCampo: false, unaSola: !campo.multiple && listas.length > 1 };
  }

  self.LlenarPatty = Object.freeze({ llenar, agregarFoto, adjuntarFotos, olvidarFotos, esDesafio, hayCampoDeFotos: () => !!campoDeFotos() });
})();
