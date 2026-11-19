// "Llenar con Patty" (desde la 1.6.0): reglas puras para reconocer los campos del formulario de publicar de Encuentra24
// por lo que dicen (etiqueta, aria-label, placeholder, name) y elegir la opción de una lista por su texto. No ve la
// página: recibe descripciones de los campos que arma llenar.js y devuelve qué poner en cada uno. Sin la API de la extensión ni red.
//
// Es un script clásico (se inyecta en la pestaña con scripting.executeScript, en el mundo aislado de la
// extensión, que la página no ve): deja sus reglas en `self.CamposPatty`. Las pruebas lo cargan con node:vm.
//
// Nunca se elige un botón (enviar, publicar, pagar), un campo de archivo, de contraseña, de correo o de teléfono, ni
// uno de búsqueda: esos quedan fuera antes de comparar palabras.
(() => {
  /** Minúsculas, sin tildes ("Baños" → "banos", "m²" → "m2"), solo letras y números separados por un espacio. */
  function normalizar(t) {
    return String(t ?? "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /** ¿La frase aparece entera (palabras completas) en el texto? Ambos ya normalizados. */
  const contiene = (texto, frase) => !!frase && ` ${texto} `.includes(` ${frase} `);

  // Tipos de campo que se pueden llenar: texto, numero, area (textarea), editable (contenteditable), select, radio.
  const CAMPOS = [
    { clave: "titulo", tipos: ["texto", "area"], sinonimos: ["titulo", "titulo del anuncio", "title", "encabezado", "nombre del anuncio", "asunto"], evitar: ["subtitulo"] },
    {
      clave: "descripcion",
      tipos: ["area", "editable", "texto"],
      sinonimos: ["descripcion", "description", "detalle", "detalles", "descripcion del anuncio", "texto del anuncio", "informacion adicional", "describe tu propiedad"],
      evitar: ["corta"],
    },
    {
      clave: "precio",
      tipos: ["numero", "texto"],
      sinonimos: ["precio", "price", "valor", "monto", "precio de venta", "precio de alquiler", "renta mensual", "alquiler mensual"],
      evitar: ["m2", "metro", "metros", "minimo", "maximo", "desde", "hasta", "mantenimiento", "cuota", "moneda"],
    },
    { clave: "moneda", tipos: ["select", "radio"], sinonimos: ["moneda", "currency", "divisa", "tipo de moneda"] },
    {
      clave: "habitaciones",
      tipos: ["numero", "texto", "select"],
      sinonimos: ["habitaciones", "habitacion", "dormitorios", "dormitorio", "cuartos", "cuarto", "recamaras", "alcobas", "bedrooms", "rooms"],
      evitar: ["bano", "banos", "servicio"],
    },
    { clave: "banos", tipos: ["numero", "texto", "select"], sinonimos: ["banos", "bano", "bathrooms", "baths", "servicios sanitarios"], evitar: ["medio", "medios"] },
    {
      clave: "m2_construccion",
      tipos: ["numero", "texto"],
      sinonimos: [
        "m2 construccion",
        "m2 de construccion",
        "metros de construccion",
        "metros construidos",
        "metros cuadrados construidos",
        "area construida",
        "area de construccion",
        "construccion",
        "superficie construida",
        "tamano de la casa",
        "area",
      ],
      evitar: ["terreno", "lote", "precio"],
    },
    {
      clave: "m2_terreno",
      tipos: ["numero", "texto"],
      sinonimos: ["m2 terreno", "m2 de terreno", "area del terreno", "area de terreno", "terreno", "lote", "tamano del lote", "superficie del terreno", "area del lote", "metros de terreno"],
      evitar: ["precio", "tipo"],
    },
    { clave: "provincia", tipos: ["select", "texto"], sinonimos: ["provincia", "province"] },
    { clave: "canton", tipos: ["select", "texto"], sinonimos: ["canton", "municipio", "municipalidad", "ciudad", "city"] },
    { clave: "distrito", tipos: ["select", "texto"], sinonimos: ["distrito", "district"] },
    {
      clave: "zona",
      tipos: ["texto", "select"],
      sinonimos: ["zona", "barrio", "sector", "localidad", "ubicacion", "direccion", "location", "address", "urbanizacion", "residencial"],
      evitar: ["mapa", "exacta"],
    },
    {
      clave: "operacion",
      tipos: ["select", "radio"],
      sinonimos: ["operacion", "tipo de operacion", "transaccion", "tipo de transaccion", "venta o alquiler", "tipo de anuncio", "categoria", "oferta"],
    },
    {
      clave: "tipo",
      tipos: ["select", "radio"],
      sinonimos: ["tipo de propiedad", "tipo de inmueble", "tipo", "inmueble", "propiedad", "property type", "subcategoria"],
      evitar: ["operacion", "moneda", "transaccion", "anuncio"],
    },
  ];

  // Las opciones que corresponden a cada valor de la ficha (operación, tipo, moneda).
  const OPCIONES = {
    operacion: {
      venta: ["venta", "vender", "en venta", "for sale", "sale", "ventas"],
      alquiler: ["alquiler", "alquilar", "en alquiler", "renta", "rentar", "for rent", "rent", "arriendo", "alquileres"],
    },
    tipo: {
      casa: ["casa", "casas", "house", "vivienda", "casa de habitacion"],
      apartamento: ["apartamento", "apartamentos", "departamento", "apto", "condominio", "condo", "apartments"],
      lote: ["lote", "lotes", "terreno", "terrenos", "land"],
      local: ["local", "locales", "local comercial", "locales comerciales"],
      oficina: ["oficina", "oficinas", "office"],
      finca: ["finca", "fincas", "quinta", "farm", "rancho"],
    },
    moneda: {
      USD: ["usd", "dolares", "dolar", "us", "us dolares", "dolares estadounidenses"],
      CRC: ["crc", "colones", "colon", "colones costarricenses"],
    },
  };

  /** Campos que nunca se tocan: botones, archivos, claves y datos de contacto o de búsqueda. */
  const TIPOS_FUERA = ["submit", "button", "reset", "image", "hidden", "file", "password", "email", "tel", "url", "search", "date", "color", "range", "checkbox"];
  const PALABRAS_FUERA = ["buscar", "search", "busqueda", "newsletter", "login", "contrasena", "password", "correo", "email", "telefono", "celular", "publicar", "enviar", "pagar"];

  /** Lo que dice un campo, por fuente y con su peso (la etiqueta pesa más que el name). */
  function textos(d) {
    return [
      [normalizar(d?.etiqueta), 3],
      [normalizar(d?.aria), 3],
      [normalizar(d?.placeholder), 2],
      [normalizar(d?.nombre), 1],
    ].filter(([t]) => t);
  }

  function esExcluido(d) {
    if (!d || typeof d !== "object" || d.bloqueado) return true;
    if (TIPOS_FUERA.includes(d.tipo)) return true;
    return textos(d).some(([t]) => PALABRAS_FUERA.some((p) => contiene(t, p)));
  }

  /** Qué tan bien un campo del formulario corresponde a un dato (0: nada). */
  function puntaje(campo, d) {
    if (esExcluido(d) || !campo.tipos.includes(d.tipo)) return 0;
    const fuentes = textos(d);
    if (fuentes.some(([t]) => (campo.evitar ?? []).some((e) => contiene(t, e)))) return 0;
    let mejor = 0;
    for (const [t, peso] of fuentes) {
      for (const s of campo.sinonimos) {
        if (!contiene(t, s)) continue;
        const exacto = t === s ? 50 : 0;
        mejor = Math.max(mejor, peso * 100 + exacto + s.length);
      }
    }
    // Sin palabras que lo digan, una lista cuyas opciones son las de ese dato (Venta / Alquiler, Dólares / Colones).
    if (!mejor && OPCIONES[campo.clave] && Array.isArray(d.opciones)) {
      const valores = Object.values(OPCIONES[campo.clave]);
      const cuantos = valores.filter((sin) => d.opciones.some((o) => sin.includes(normalizar(o)))).length;
      if (cuantos >= 2) mejor = 90;
    }
    return mejor;
  }

  const ES_RELLENO = /^(seleccion|selecciona|elige|elegir|escoge|select|choose|ninguno|ninguna|todas|todos)\b/;
  /** "Selecciona", "--" o vacía: la opción que no es ninguna. Un "$" o "₡" solo sí cuenta (es la moneda). */
  const esRelleno = (crudo, t) => !crudo.trim() || /^[-–—_.\s]+$/.test(crudo) || ES_RELLENO.test(t);
  const sinTildes = (o) => String(o ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  /** Opción de una lista con número ("3", "5+", "5 o más"): el número y si es "o más". */
  function numeroDeOpcion(t) {
    const m = /^(\d+(?:[.,]\d+)?)\s*(\+|o mas|y mas|mas)?/.exec(t);
    if (!m) return null;
    return { n: Number(m[1].replace(",", ".")), mas: !!m[2] || /\+/.test(t) };
  }

  /**
   * La opción de la lista que corresponde al valor, por su texto (o -1: se deja como está). `opciones` son los textos
   * visibles. Con números, la exacta o la mayor "N o más" que alcance.
   */
  function elegirOpcion(clave, valor, opciones) {
    if (!Array.isArray(opciones) || valor === null || valor === undefined || valor === "") return -1;
    const crudo = opciones.map((o) => String(o ?? ""));
    const normal = opciones.map((o) => normalizar(o));
    const validas = normal.map((t, i) => (esRelleno(crudo[i], t) ? -1 : i)).filter((i) => i >= 0);
    if (typeof valor === "number") {
      const nums = validas.map((i) => ({ i, k: numeroDeOpcion(sinTildes(crudo[i])) })).filter((x) => x.k);
      const exacta = nums.find((x) => x.k.n === valor && !x.k.mas) ?? nums.find((x) => x.k.n === valor);
      if (exacta) return exacta.i;
      const mas = nums.filter((x) => x.k.mas && x.k.n <= valor).sort((a, b) => b.k.n - a.k.n)[0];
      return mas ? mas.i : -1;
    }
    if (clave === "moneda") {
      const porSimbolo = validas.find((i) => (valor === "CRC" ? crudo[i].includes("₡") : /\$/.test(crudo[i]) && !crudo[i].includes("₡")));
      if (porSimbolo !== undefined) return porSimbolo;
    }
    const sinonimos = OPCIONES[clave]?.[valor] ?? [normalizar(valor)];
    for (const s of sinonimos) {
      const i = validas.find((j) => normal[j] === s || normal[j] === `${s}s` || normal[j] === `${s}es`);
      if (i !== undefined) return i;
    }
    for (const s of sinonimos) {
      const i = validas.find((j) => contiene(normal[j], s) || (normal[j].length >= 4 && contiene(s, normal[j])));
      if (i !== undefined) return i;
    }
    return -1;
  }

  const numeroTexto = (n, entero) => (typeof n === "number" && Number.isFinite(n) ? String(entero ? Math.round(n) : Math.round(n * 10) / 10) : null);

  /** El valor de un dato para un campo: texto para escribir, o el valor crudo para elegir una opción. */
  function valorPara(clave, datos, tipo) {
    const d = datos ?? {};
    const lista = tipo === "select" || tipo === "radio";
    switch (clave) {
      case "titulo":
        return d.es?.titulo || null;
      case "descripcion":
        return d.es?.descripcion || null;
      case "precio":
        return numeroTexto(d.precio, true);
      case "habitaciones":
      case "banos":
        if (typeof d[clave] !== "number") return null;
        return lista ? d[clave] : numeroTexto(d[clave], clave === "habitaciones");
      case "m2_construccion":
      case "m2_terreno":
        return numeroTexto(d[clave], true);
      case "zona":
        return d.zona || [d.distrito, d.canton].filter(Boolean).join(", ") || null;
      case "moneda":
      case "operacion":
      case "tipo":
      case "provincia":
      case "canton":
      case "distrito":
        return d[clave] || null;
      default:
        return null;
    }
  }

  /** Las claves que tienen dato (son las que se buscan en el formulario). */
  function conDato(datos) {
    return CAMPOS.map((c) => c.clave).filter((k) => valorPara(k, datos, "texto") !== null || valorPara(k, datos, "select") !== null);
  }

  /**
   * Qué poner en cada campo. `descriptores`: [{ tipo, etiqueta, aria, placeholder, nombre, opciones?, vacio, bloqueado }]
   * en el orden de la página. Cada campo se usa una vez; gana el mejor puntaje. Devuelve
   * { acciones: [{ clave, indice, valor } | { clave, indice, opcion }], faltan, sinOpcion, yaTenian }.
   */
  function planear(descriptores, datos, soloClaves = null) {
    const lista = Array.isArray(descriptores) ? descriptores : [];
    const claves = conDato(datos).filter((k) => !soloClaves || soloClaves.includes(k));
    const pares = [];
    for (const campo of CAMPOS) {
      if (!claves.includes(campo.clave)) continue;
      lista.forEach((d, indice) => {
        const p = puntaje(campo, d);
        if (p > 0) pares.push({ clave: campo.clave, indice, p });
      });
    }
    pares.sort((a, b) => b.p - a.p || a.indice - b.indice);
    const usados = new Set();
    const hechas = new Set();
    const acciones = [];
    const sinOpcion = [];
    const yaTenian = [];
    for (const { clave, indice } of pares) {
      if (usados.has(indice) || hechas.has(clave)) continue;
      const d = lista[indice];
      usados.add(indice);
      hechas.add(clave);
      if (d.vacio === false) {
        yaTenian.push(clave);
        continue;
      }
      const valor = valorPara(clave, datos, d.tipo);
      if (valor === null) continue;
      if (d.tipo === "select" || d.tipo === "radio") {
        const opcion = elegirOpcion(clave, valor, d.opciones);
        if (opcion < 0) sinOpcion.push(clave);
        else acciones.push({ clave, indice, opcion });
      } else {
        acciones.push({ clave, indice, valor: String(valor) });
      }
    }
    const faltan = claves.filter((k) => !hechas.has(k));
    return { acciones, faltan, sinOpcion, yaTenian };
  }

  /** Las casillas (checkbox) de amenidades que corresponden a las de la casa: índices en `etiquetas`. */
  function marcarAmenidades(etiquetas, amenidades) {
    const buscadas = (Array.isArray(amenidades) ? amenidades : []).map(normalizar).filter((a) => a.length >= 4);
    const indices = [];
    (Array.isArray(etiquetas) ? etiquetas : []).forEach((e, i) => {
      const t = normalizar(e);
      if (t.length < 4 || PALABRAS_FUERA.some((p) => contiene(t, p)) || /\b(acepto|terminos|condiciones|privacidad|recibir)\b/.test(t)) return;
      if (buscadas.some((a) => a === t || contiene(a, t) || contiene(t, a))) indices.push(i);
    });
    return indices;
  }

  self.CamposPatty = Object.freeze({ normalizar, contiene, CAMPOS, OPCIONES, esExcluido, puntaje, elegirOpcion, valorPara, conDato, planear, marcarAmenidades });
})();
