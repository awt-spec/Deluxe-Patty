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
