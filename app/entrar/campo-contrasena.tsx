"use client";

import { useState } from "react";

/** Campo de contraseña con "Mostrar", para que quien escribe en el teléfono vea lo que teclea. */
export function CampoContrasena({ id = "contrasena", name = "contrasena" }: { id?: string; name?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="campo-contrasena">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={200}
        placeholder="Tu contraseña"
      />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible} aria-label={visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}>
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
