import { ImageResponse } from "next/og";

// Ícono de la app en la pantalla de inicio del iPhone (al "Agregar a inicio"): el mismo dibujo del favicon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function IconoApple() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#00a884" }}>
        <svg width="150" height="150" viewBox="0 0 64 64">
          <path d="M14 30 32 15l18 15v17a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinejoin="round" />
          <path d="M26 50V37h12v13" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinejoin="round" />
          <circle cx="49" cy="17" r="9" fill="#fff" />
          <path d="M45 17h0m4 0h0m4 0h0" stroke="#00a884" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
