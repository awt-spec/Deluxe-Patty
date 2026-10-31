// Íconos de trazo, dibujados aquí para que se vean igual en todos los teléfonos (los emojis cambian
// según la marca del teléfono y el de calendario sale en inglés). Toman el color del texto.

type Props = { tamano?: number };

function Icono({ tamano = 24, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconoChats = (p: Props) => (
  <Icono {...p}>
    <path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z" />
    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeWidth={2.4} />
  </Icono>
);

export const IconoAgenda = (p: Props) => (
  <Icono {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" strokeWidth={2.4} />
  </Icono>
);

export const IconoCasa = (p: Props) => (
  <Icono {...p}>
    <path d="M3.5 11 12 4l8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M10 20v-5.5h4V20" />
  </Icono>
);

export const IconoMas = (p: Props) => (
  <Icono {...p}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
  </Icono>
);

export const IconoProbar = (p: Props) => (
  <Icono {...p}>
    <path d="M12 3.5 13.6 8l4.4 1.6-4.4 1.6L12 15.6l-1.6-4.4L6 9.6 10.4 8 12 3.5Z" />
    <path d="M18.5 15v4M16.5 17h4M5.5 16.5v3M4 18h3" />
  </Icono>
);

export const IconoResumen = (p: Props) => (
  <Icono {...p}>
    <path d="M6.5 3.5h8l4 4v13h-12z" />
    <path d="M14.5 3.5v4h4M9.5 12h6M9.5 15.5h6M9.5 8.5h2" />
  </Icono>
);

export const IconoLlave = (p: Props) => (
  <Icono {...p}>
    <circle cx="8" cy="15.5" r="4.5" />
    <path d="m11.2 12.3 8.3-8.3M16.5 7l2.5 2.5M14 9.5l2 2" />
  </Icono>
);

export const IconoAnuncio = (p: Props) => (
  <Icono {...p}>
    <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1Z" />
    <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
  </Icono>
);

export const IconoReloj = (p: Props) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icono>
);

export const IconoAjustes = (p: Props) => (
  <Icono {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icono>
);

export const IconoSalir = (p: Props) => (
  <Icono {...p}>
    <path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14" />
    <path d="M10.5 12h9M16.5 8.5 20 12l-3.5 3.5" />
  </Icono>
);

export const IconoFlecha = (p: Props) => (
  <Icono {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Icono>
);

export const IconoCorreo = (p: Props) => (
  <Icono {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Icono>
);

export const IconoEnviar = (p: Props) => (
  <Icono {...p}>
    <path d="M4 12 20 4l-5 16-3.5-6.5L4 12Z" />
    <path d="m11.5 13.5 3-3" />
  </Icono>
);

export const IconoTelefono = (p: Props) => (
  <Icono {...p}>
    <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5L16 14l4 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z" />
  </Icono>
);

export const IconoAtras = (p: Props) => (
  <Icono {...p}>
    <path d="M15 5 8 12l7 7" strokeWidth={2.2} />
  </Icono>
);

export const IconoCheck = (p: Props) => (
  <Icono {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth={2.2} />
  </Icono>
);

export const IconoDobleCheck = (p: Props) => (
  <Icono {...p}>
    <path d="m2.5 12.5 4 4L15 8" strokeWidth={2} />
    <path d="m11 15.5 1 1L20.5 8" strokeWidth={2} />
  </Icono>
);

export const IconoLapiz = (p: Props) => (
  <Icono {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Icono>
);

export const IconoDocumento = (p: Props) => (
  <Icono {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Icono>
);

export const IconoCamara = (p: Props) => (
  <Icono {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icono>
);

export const IconoMegafono = (p: Props) => (
  <Icono {...p}>
    <path d="M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1Z" />
    <path d="M18 9.5a3.5 3.5 0 0 1 0 5M8 15l1.5 4.5" />
  </Icono>
);

export const IconoEstrella = (p: Props) => (
  <Icono {...p}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  </Icono>
);

export const IconoArriba = (p: Props) => (
  <Icono {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" strokeWidth={2} />
  </Icono>
);

export const IconoAbajo = (p: Props) => (
  <Icono {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" strokeWidth={2} />
  </Icono>
);

export const IconoAgregar = (p: Props) => (
  <Icono {...p}>
    <path d="M12 5v14M5 12h14" strokeWidth={2.2} />
  </Icono>
);
