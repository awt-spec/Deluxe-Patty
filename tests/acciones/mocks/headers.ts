const galletas = new Map<string, string>();
export async function cookies() {
  return {
    get: (n: string) => (galletas.has(n) ? { name: n, value: galletas.get(n)! } : undefined),
    set: (n: string, v: string) => void galletas.set(n, v),
    delete: (n: string) => void galletas.delete(n),
  };
}
export async function headers() {
  return new Headers({ host: "deluxe-patty.vercel.app" });
}
