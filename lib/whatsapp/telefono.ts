// Teléfonos de WhatsApp: Meta los manda con código de país y sin "+"; en la base pueden haber quedado con espacios,
// guiones o sin "+506" (cargados a mano o por SQL).

/** Dígitos con código de país: un celular de Costa Rica de 8 dígitos gana su "506". */
export function digitosTelefono(t: string): string {
  const d = t.replace(/\D/g, "");
  return /^[245678]\d{7}$/.test(d) ? `506${d}` : d;
}

/** E.164 ("+50670000000") o null si no hay número. */
export function telefonoE164(t: string | null | undefined): string | null {
  if (!t) return null;
  const d = digitosTelefono(t);
  return d ? `+${d}` : null;
}

/** El mismo número, escrito como sea. */
export function mismoTelefono(a: string, b: string): boolean {
  const x = digitosTelefono(a);
  return x.length > 0 && x === digitosTelefono(b);
}
