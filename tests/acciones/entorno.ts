// Entorno para probar las acciones del servidor (server actions) sin Next ni Supabase:
// - redirect / notFound lanzan errores que la prueba puede revisar (en Next también cortan la acción lanzando).
// - Supabase en memoria: aplica los filtros eq e in como la base, devuelve lo que corresponde y anota cada
//   escritura, para poder afirmar "con datos de otro corredor no se tocó nada".
// - `estado` dice quién tiene sesión (corredor y superadmin) y qué base usa el backend; cada prueba lo arma.

export class Redireccion extends Error {
  constructor(public readonly url: string) {
    super(`redirect → ${url}`);
    this.name = "Redireccion";
  }
}

export class NoEncontrado extends Error {
  constructor() {
    super("404");
    this.name = "NoEncontrado";
  }
}

type Fila = Record<string, unknown>;
export type Escritura = { tabla: string; op: "insert" | "update" | "upsert" | "delete"; filtros: [string, unknown][]; valores?: unknown };

export interface SupabaseFalso {
  tablas: Record<string, Fila[]>;
  escrituras: Escritura[];
  rpcs: { nombre: string; args: unknown }[];
  /** Respuesta de cada rpc (por nombre). */
  respuestasRpc: Record<string, unknown>;
  /** Error forzado para la próxima escritura en una tabla (por ejemplo { code: "23505" }). */
  errorEn: Record<string, { code?: string; message?: string } | undefined>;
  usuarios: { id: string; email: string; last_sign_in_at?: string | null }[];
  usuariosCreados: { email: string; password: string }[];
  contrasenas: { id: string; password: string }[];
  /** Archivos subidos al almacenamiento (camino). */
  subidas: string[];
  from: (tabla: string) => Consulta;
  rpc: (nombre: string, args: unknown) => Promise<{ data: unknown; error: null }>;
  auth: unknown;
  storage: unknown;
}

type Consulta = Record<string, (...a: unknown[]) => unknown> & PromiseLike<{ data: unknown; error: unknown; count?: number }>;

export function supabaseFalso(tablas: Record<string, Fila[]> = {}): SupabaseFalso {
  const db: SupabaseFalso = {
    tablas,
    escrituras: [],
    rpcs: [],
    respuestasRpc: {},
    errorEn: {},
    usuarios: [],
    usuariosCreados: [],
    contrasenas: [],
    subidas: [],
    from: (tabla) => consulta(db, tabla),
    rpc: async (nombre, args) => {
      db.rpcs.push({ nombre, args });
      return { data: db.respuestasRpc[nombre] ?? null, error: null };
    },
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: db.usuarios }, error: null }),
        createUser: async ({ email, password }: { email: string; password: string }) => {
          if (db.usuarios.some((u) => u.email === email)) return { data: { user: null }, error: { message: "User already registered" } };
          const user = { id: `00000000-0000-4000-8000-${String(db.usuarios.length + 100).padStart(12, "0")}`, email };
          db.usuarios.push(user);
          db.usuariosCreados.push({ email, password });
          return { data: { user }, error: null };
        },
        updateUserById: async (id: string, { password }: { password: string }) => {
          db.contrasenas.push({ id, password });
          return { data: {}, error: null };
        },
      },
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (camino: string) => ({ data: { signedUrl: `https://subida/${camino}`, token: "t" }, error: null }),
        getPublicUrl: (camino: string) => ({ data: { publicUrl: `https://fotos.publicas/${camino}` } }),
        upload: async (camino: string) => {
          db.subidas.push(camino);
          return { data: { path: camino }, error: null };
        },
      }),
    },
  };
  return db;
}

function consulta(db: SupabaseFalso, tabla: string): Consulta {
  const filtros: [string, unknown][] = [];
  const enLista: [string, unknown[]][] = [];
  // ilike sin comodines (como lo usan registrarDuda y ensenarAlCerebro): igual sin mayúsculas.
  const parecidos: [string, string][] = [];
  let op: Escritura["op"] | "select" = "select";
  let valores: unknown;
  let contar = false;
  let soloCabecera = false;

  const filas = () =>
    (db.tablas[tabla] ?? []).filter(
      (f) =>
        filtros.every(([c, v]) => f[c] === v) &&
        enLista.every(([c, l]) => l.includes(f[c])) &&
        parecidos.every(([c, v]) => String(f[c] ?? "").toLowerCase() === v.replace(/\\(.)/g, "$1").toLowerCase()),
    );

  const resolver = () => {
    if (op === "select") {
      const r = filas();
      return { data: soloCabecera ? null : r, error: null, count: contar ? r.length : undefined };
    }
    const error = db.errorEn[tabla];
    if (error) {
      db.errorEn[tabla] = undefined;
      return { data: null, error };
    }
    db.escrituras.push({ tabla, op, filtros: [...filtros], valores });
    const lista = (db.tablas[tabla] ??= []);
    if (op === "update") for (const f of filas()) Object.assign(f, valores);
    if (op === "delete") db.tablas[tabla] = lista.filter((f) => !filas().includes(f));
    if (op === "insert" || op === "upsert") {
      const nuevas = (Array.isArray(valores) ? valores : [valores]).map((v, i) => ({ id: `nuevo-${lista.length + i}`, ...(v as Fila) }));
      lista.push(...nuevas);
      return { data: nuevas, error: null };
    }
    return { data: null, error: null };
  };

  const q: Consulta = {
    select: (_c: unknown, o?: unknown) => {
      const opc = (o ?? {}) as { count?: string; head?: boolean };
      contar = !!opc.count;
      soloCabecera = !!opc.head;
      return q;
    },
    insert: (v: unknown) => ((op = "insert"), (valores = v), q),
    update: (v: unknown) => ((op = "update"), (valores = v), q),
    upsert: (v: unknown) => ((op = "upsert"), (valores = v), q),
    delete: () => ((op = "delete"), q),
    eq: (c: unknown, v: unknown) => (filtros.push([c as string, v]), q),
    in: (c: unknown, l: unknown) => (enLista.push([c as string, l as unknown[]]), q),
    ilike: (c: unknown, v: unknown) => (parecidos.push([c as string, String(v)]), q),
    // Filtros que no cambian quién es dueño de qué: se aceptan sin filtrar.
    neq: () => q,
    like: () => q,
    gte: () => q,
    gt: () => q,
    lte: () => q,
    lt: () => q,
    not: () => q,
    or: () => q,
    is: () => q,
    order: () => q,
    limit: () => q,
    range: () => q,
    maybeSingle: async () => {
      const r = resolver();
      const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return { data: d, error: r.error };
    },
    single: async () => {
      const r = resolver();
      const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return { data: d, error: r.error ?? (d ? null : { code: "PGRST116", message: "sin filas" }) };
    },
    then: (ok: (v: { data: unknown; error: unknown; count?: number }) => unknown, mal?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(ok, mal),
  } as unknown as Consulta;
  return q;
}

export const ID = {
  deluxe: "00000000-0000-4000-8000-000000000001",
  otro: "00000000-0000-4000-8000-000000000002",
  usuario: "10000000-0000-4000-8000-000000000001",
  cliente: "20000000-0000-4000-8000-000000000001",
  clienteAjeno: "20000000-0000-4000-8000-000000000002",
  conversacion: "30000000-0000-4000-8000-000000000001",
  conversacionAjena: "30000000-0000-4000-8000-000000000002",
  mensaje: "40000000-0000-4000-8000-000000000001",
  mensajeAjeno: "40000000-0000-4000-8000-000000000002",
  cita: "50000000-0000-4000-8000-000000000001",
  citaAjena: "50000000-0000-4000-8000-000000000002",
  casa: "60000000-0000-4000-8000-000000000001",
  casaAjena: "60000000-0000-4000-8000-000000000002",
};

export const estado: {
  /** Sesión del corredor (null = sin sesión: la acción manda a /entrar). */
  sesion: { supabase: SupabaseFalso; corredor: Record<string, unknown>; usuario: { id: string; email: string } } | null;
  /** Base del backend (service_role). */
  admin: SupabaseFalso;
  /** Correo del superadmin con sesión, o null (entonces /admin responde 404). */
  superadmin: string | null;
} = { sesion: null, admin: supabaseFalso(), superadmin: null };

export function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

/** Corre la acción y devuelve la dirección a la que redirige (o lanza si no redirige). */
export async function redirigeA(accion: Promise<unknown>): Promise<string> {
  try {
    await accion;
  } catch (e) {
    if (e instanceof Redireccion) return e.url;
    throw e;
  }
  throw new Error("La acción no redirigió");
}
