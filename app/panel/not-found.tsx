import Link from "next/link";

// "No encontrado" del panel (un cliente, una casa o una visita que no existe o no es de este corredor), en español y
// dentro del panel. Ojo: con el esqueleto de carga (app/panel/loading.tsx) Next ya mandó la respuesta 200 cuando la
// página llama a notFound(); el navegador ve esta pantalla y Next agrega <meta name="robots" content="noindex">.
export default function NoEncontrado() {
  return (
    <section className="pantalla-error">
      <h1>No encontré eso</h1>
      <p>Puede que ya no exista o que el enlace esté incompleto.</p>
      <div className="botones" style={{ marginTop: 16 }}>
        <Link href="/panel" className="boton primario grande">
          Volver a Inicio
        </Link>
      </div>
    </section>
  );
}
