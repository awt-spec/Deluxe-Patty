import { estado } from "../entorno";

// lib/supabase/admin: el backend (service_role) usa la base en memoria de la prueba.
export const createAdminClient = () => estado.admin;
