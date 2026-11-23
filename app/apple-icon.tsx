import { ImageResponse } from "next/og";

// Ícono de la app en la pantalla de inicio del iPhone (al "Agregar a inicio"): el mismo dibujo del favicon (app/icon.svg),
// a sangre: iOS redondea las esquinas solo.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function IconoApple() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #00c08b 0%, #008f6b 100%)",
        }}
      >
        <svg width="156" height="156" viewBox="0 0 64 64">
          <path
            d="M22 11h20a11 11 0 0 1 11 11v13a11 11 0 0 1-11 11H27l-10 8v-8.6A11 11 0 0 1 11 35V22a11 11 0 0 1 11-11z"
            fill="#fff"
          />
          <path d="M32 17.5 44 27.5v12a1.5 1.5 0 0 1-1.5 1.5H36v-8h-8v8h-6.5a1.5 1.5 0 0 1-1.5-1.5v-12z" fill="#00a884" />
        </svg>
      </div>
    ),
    size,
  );
}
