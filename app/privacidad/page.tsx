import type { Metadata } from "next";
import { marcaDeEntrada } from "@/lib/panel/marca";

// Política de privacidad pública (la pide Meta para publicar la app de WhatsApp). Ley 8968 de Costa
// Rica. El responsable es el corredor que atiende al cliente; con un solo corredor activo se nombra
// (hoy Deluxe Properties), con varios queda en general. Sin datos de nadie en la página.

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo el asistente de WhatsApp trata los datos personales de clientes y propietarios.",
};

export const revalidate = 3600;

const ACTUALIZADA = "10 de noviembre de 2026";

export default async function Privacidad() {
  const marca = await marcaDeEntrada(null);
  const corredor = marca?.nombre ?? "el corredor inmobiliario que te atiende";

  return (
    <main className="legal">
      <h1>Política de privacidad</h1>
      <p className="legal-fecha">Última actualización: {ACTUALIZADA}</p>

      <p>
        Esta política explica cómo se tratan tus datos personales cuando escribes por WhatsApp a {corredor} y te
        responde su asistente virtual, o cuando el corredor te contacta como cliente o propietario. Se rige por la Ley
        de Protección de la Persona frente al Tratamiento de sus Datos Personales de Costa Rica (Ley 8968) y su
        reglamento.
      </p>

      <h2>1. Quién es responsable</h2>
      <p>
        El responsable de tus datos es {corredor}, el corredor con quien conversas. El asistente es una herramienta de
        software que el corredor usa para atender sus mensajes, agendar visitas y dar seguimiento; el proveedor de esa
        herramienta trata los datos solo por cuenta del corredor y para prestarle el servicio.
      </p>

      <h2>2. Qué datos se recogen</h2>
      <ul>
        <li>Tu número de WhatsApp y el nombre de tu perfil.</li>
        <li>Los mensajes que envías y recibes en la conversación con el corredor.</li>
        <li>Lo que nos cuentas que buscas (tipo de propiedad, zona, presupuesto), las visitas que agendas y sus fechas.</li>
        <li>Tu correo, si nos lo das, para enviarte la invitación de una visita.</li>
        <li>
          Si eres propietario y publicaste tu propiedad en un portal de anuncios: los datos públicos del anuncio
          (descripción, precio, zona y el contacto que publicaste).
        </li>
      </ul>
      <p>
        No se recogen datos sensibles a propósito. Si mandas una nota de voz, se pasa a texto con inteligencia
        artificial para entender tu mensaje; si mandas una foto o un PDF, se lee para saber de qué trata. Los
        videos no se procesan: se le avisan al corredor para que los revise él. Los archivos no se guardan: solo
        queda el texto de lo que se entendió en la conversación.
      </p>

      <h2>3. Para qué se usan</h2>
      <ul>
        <li>Contestar tus consultas sobre propiedades y darte la información que pidas.</li>
        <li>Agendar, confirmar, cambiar o recordarte visitas.</li>
        <li>Que el corredor dé seguimiento a tu búsqueda o a tu propiedad y te ofrezca opciones que te sirvan.</li>
      </ul>
      <p>
        No se usan para publicidad de terceros ni se venden. El asistente no inicia conversaciones en frío: el primer
        mensaje a un propietario lo envía el corredor en persona.
      </p>

      <h2>4. Inteligencia artificial</h2>
      <p>
        Para entender y redactar respuestas, el texto de la conversación se procesa con modelos de inteligencia
        artificial. Los temas delicados (negociación de precio, comisiones, ofertas formales y quejas) pasan siempre al
        corredor. El asistente no inventa datos de una propiedad: si no los tiene, te dice que lo confirma con el
        corredor.
      </p>

      <h2>5. Con quién se comparten</h2>
      <p>Solo con los proveedores que hacen funcionar el servicio, cada uno para su tarea:</p>
      <ul>
        <li>Meta (WhatsApp), para enviar y recibir los mensajes.</li>
        <li>Anthropic (Claude), para procesar el texto de la conversación con inteligencia artificial y leer fotos y PDF.</li>
        <li>OpenAI, para pasar a texto las notas de voz y, cuando el corredor lo pide, para editar fotos de sus propiedades.</li>
        <li>Supabase y Vercel, para guardar los datos y alojar la aplicación.</li>
        <li>Google, si el corredor conecta su calendario o su correo, para agendar la visita y enviarte la invitación.</li>
      </ul>
      <p>
        Estos proveedores pueden estar fuera de Costa Rica, por lo que los datos pueden transferirse a otros países. Se
        trabaja con proveedores que ofrecen medidas de seguridad y confidencialidad adecuadas; según sus condiciones
        comerciales, los proveedores de inteligencia artificial no usan estos datos para entrenar sus modelos.
      </p>

      <h2>6. Cuánto tiempo se guardan</h2>
      <p>
        Mientras exista la relación con el corredor o mientras sean necesarios para la finalidad por la que se
        recogieron, y hasta que pidas borrarlos, salvo que una ley obligue a conservarlos más tiempo.
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Los datos se guardan cifrados en tránsito, con acceso restringido: cada corredor solo ve sus propios clientes, y
        los registros técnicos de errores no guardan teléfonos, nombres ni el contenido de los mensajes.
      </p>

      <h2 id="borrar">8. Tus derechos y cómo borrar tus datos</h2>
      <p>
        Tienes derecho a saber qué datos tuyos se guardan, a corregirlos y a pedir que se borren, así como a retirar tu
        consentimiento. Para ejercerlos, escríbele a {corredor} por el mismo WhatsApp en que conversaron, con la
        palabra <strong>«Privacidad»</strong> y lo que pides (por ejemplo, «Privacidad: borren mis datos»). El corredor
        atiende la solicitud y te responde en un plazo máximo de cinco días hábiles. Si dejas de querer recibir
        mensajes, basta con decirlo o bloquear el número.
      </p>
      <p>
        Si consideras que no se respetaron tus derechos, puedes acudir a la Agencia de Protección de Datos de los
        Habitantes (PRODHAB).
      </p>

      <h2>9. Menores de edad</h2>
      <p>El servicio está dirigido a personas mayores de edad. No se recogen a sabiendas datos de menores.</p>

      <h2>10. Cambios</h2>
      <p>Si esta política cambia, se publicará aquí con su nueva fecha de actualización.</p>
    </main>
  );
}
