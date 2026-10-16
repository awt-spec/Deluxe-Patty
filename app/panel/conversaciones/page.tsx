import { redirect } from "next/navigation";

// La lista de chats ahora es el inicio del panel.
export default function Conversaciones() {
  redirect("/panel");
}
