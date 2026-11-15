import Link from "next/link";

// Página que no existe (fuera del panel), en español en vez de la de Next en inglés.
export default function NoEncontrado() {
  return (
    <main className="panel pantalla-error">
      <h1>No encontré esa página</h1>
      <p>Puede que ya no exista o que el enlace esté incompleto.</p>
      <div className="botones" style={{ marginTop: 16 }}>
        <Link href="/panel" className="boton primario grande">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
