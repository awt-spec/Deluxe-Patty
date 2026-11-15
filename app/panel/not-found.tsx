import Link from "next/link";

// "No encontrado" del panel (un cliente, una casa o una visita que no existe o no es de este corredor), en español y
// dentro del panel, con estado 404. Ningún loading.tsx puede envolver las páginas [id]: un esqueleto de carga empieza a
// mandar la respuesta (con 200) antes de que la página llame a notFound(). Por eso los esqueletos de las listas viven
// en grupos de rutas — app/panel/(inicio), clientes/(lista), agenda/(vista), propiedades/(lista), anuncios/(lista) —
// y no en app/panel/loading.tsx ni en clientes/loading.tsx.
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
