// Crea (o deja como nueva) la cuenta de demo: un corredor inactivo con la marca de Deluxe y datos
// ficticios, y el usuario DEMO_CORREO enlazado solo a él. Se entra con "Ver la demo" en /entrar.
//
//   npm run demo        (lee SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y DEMO_CORREO de .env.local)
//
// DEMO_CORREO no necesita buzón: nunca se le manda un correo. Va también en Vercel para que aparezca el
// botón. Volver a correrlo borra lo que los visitantes cambiaron y carga todo de nuevo; en producción lo
// hace solo cada noche el cron /api/cron/demo.
import { createClient } from "@supabase/supabase-js";
import { rehacerDemo } from "../lib/panel/demo-datos";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const correo = process.env.DEMO_CORREO?.trim().toLowerCase();
if (!url || !llave || !correo) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DEMO_CORREO (en .env.local).");
  process.exit(1);
}
const db = createClient(url, llave, { auth: { persistSession: false } });

await rehacerDemo(db, correo);

console.log(`Demo lista: 4 casas, 4 chats (uno espera respuesta y otro pide hablar con Patricia), 2 visitas y 2 dueños.`);
console.log(`Para que aparezca "Ver la demo" en /entrar, pon DEMO_CORREO=${correo} en Vercel y vuelve a desplegar.`);
