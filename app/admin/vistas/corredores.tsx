import type { FilaAdmin } from "@/lib/admin/datos";
import { estadoCorredor, estadoWhatsApp } from "@/lib/admin/atencion";
import { Encabezado, Tarjeta, hace } from "../ui";
import { ListaCorredores, type FilaLista } from "./lista-corredores";

// Corredores (vista pura): la tabla con búsqueda y filtro.

export function filaLista(f: FilaAdmin, ahora = new Date()): FilaLista {
  return {
    id: f.c.id,
    nombre: f.c.nombre,
    contacto: f.c.nombre_contacto,
    estado: estadoCorredor(f),
    whatsapp: estadoWhatsApp(f),
    automatica: f.c.respuesta_automatica,
    gastoMes: f.gastoMes,
    topeMes: f.topeMes,
    mensajesMes: f.mensajesMes,
    topeMensajes: f.c.tope_mensajes_mes,
    ultimo: hace(f.ultimoEntrante, ahora),
  };
}

export function VistaCorredores({ filas, ahora }: { filas: FilaAdmin[]; ahora?: Date }) {
  return (
    <>
      <Encabezado
        titulo="Corredores"
        descripcion={`${filas.length === 1 ? "1 corredor" : `${filas.length} corredores`} en la plataforma. Abre uno para ver y cambiar sus datos.`}
      />
      <Tarjeta titulo="Todos los corredores">
        <ListaCorredores filas={filas.map((f) => filaLista(f, ahora))} />
      </Tarjeta>
    </>
  );
}
