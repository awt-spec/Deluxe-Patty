import { compararVersiones } from "@/lib/panel/extension-instalar";

// Qué trae cada versión de la extensión, en palabras de todos los días, para el asistente de "Actualízala": la persona
// sabe por qué vale la pena y qué va a ver distinto. La primera frase es la de la versión más nueva que trae algo que se
// ve (la 1.4.1 solo arregla cosas, así que también cuenta el panel lateral de la 1.4.0).

const NOVEDADES: { version: string; texto: (asistente: string) => string }[] = [
  {
    version: "1.6.0",
    texto: (a) =>
      `En el formulario de publicar de Encuentra24, ${a} llena el título, la descripción, el precio, los datos y las fotos del anuncio que preparó; tú revisas y publicas.`,
  },
  {
    version: "1.5.2",
    texto: (a) => `Tu panel ve si ${a} busca sola cada semana y te dice cuándo toca la próxima búsqueda.`,
  },
  {
    version: "1.5.1",
    texto: (a) => `El panel lateral muestra la energía de ${a} como una batería: así ves cuánto le queda este mes.`,
  },
  {
    version: "1.5.0",
    texto: (a) =>
      `El panel de ${a} se ve más claro: el avance en un círculo, los pasos por minuto y botones grandes para buscar dueños o leer el anuncio que estás viendo.`,
  },
  {
    version: "1.4.1",
    texto: (a) =>
      `Arregla detalles: en pausa, ${a} se hace a un lado en una ficha chica para que uses la página, y si Chrome la interrumpe guarda lo leído y te lo dice.`,
  },
  { version: "1.4.0", texto: (a) => `Abre un panel al lado de la página donde ves a ${a} trabajar, paso a paso, y la pausas o detienes desde ahí.` },
  { version: "1.3.0", texto: (a) => `${a} busca a ritmo de persona, a la vista, y la puedes pausar o detener.` },
  { version: "1.2.0", texto: () => "Se conecta sola con tu panel." },
];

/** Lo nuevo desde la versión instalada (o todo lo reciente si no se sabe cuál es), hasta dos frases. */
export function novedadesDesde(instalada: string | null, asistente: string): string[] {
  const nombre = asistente.trim() || "Patty";
  return NOVEDADES.filter((n) => !instalada || compararVersiones(instalada, n.version) < 0)
    .slice(0, 2)
    .map((n) => n.texto(nombre));
}
