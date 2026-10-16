# Set de conversaciones de prueba

Pasa conversaciones de clientes por la asistente real (Claude de verdad, con las instrucciones de
`prompts/`) sobre una base y un WhatsApp simulados, y revisa cada respuesta contra las reglas del
producto. Se corre antes de unir cualquier cambio de tono o de instrucciones.

```bash
ANTHROPIC_API_KEY=… npm run eval:conversaciones                       # todo el set
ANTHROPIC_API_KEY=… npm run eval:conversaciones -- --etiqueta agenda  # un tipo de caso
ANTHROPIC_API_KEY=… npm run eval:conversaciones -- --solo saludo --veces 3
```

Cada vuelta completa son del orden de 60 a 90 llamadas a Claude. El resultado queda en
`evals/resultados/<fecha>/` (fuera del repositorio): `resumen.md` con cada conversación y lo que falló,
y `resultados.jsonl` para comparar vueltas.

## Qué hay aquí

- `propiedades.json`: tres propiedades ficticias (casa en Escazú, apartamento en Santa Ana, lote en Belén).
- `casos.json`: las conversaciones. **Hoy son 30 sintéticas, escritas a mano**; se reemplazan o completan
  con conversaciones reales de Patricia (sin nombres ni teléfonos) en cuanto lleguen.
- `calificar.ts`: las reglas que se revisan con código (probadas en `tests/evals.test.ts`).

La corredora simulada es Deluxe con las reglas de escalamiento de la semilla, contestando sola, y el reloj
fijo en el lunes 19 de octubre de 2026 a las 9:00, con horario de visitas lunes a viernes de 8:00 a 17:00.

## Cómo se califica

Con código, en cada conversación:

| Regla | Qué revisa |
|---|---|
| `resultado` | Que el último mensaje termine como se espera: respondido, pasado a Patricia o en la agenda. |
| `intencion` | La intención que le puso Haiku al último mensaje. |
| `accion_agenda` | Qué hizo la agenda: propuso horarios, agendó, canceló. |
| `aviso_corredora` | Que a Patricia le llegue aviso cuando corresponde (escalamientos, datos por confirmar, citas) y no cuando no. |
| `debe` / `no_debe` | Frases que la respuesta tiene que traer o no puede traer (por ejemplo, el precio correcto, o "sí se aceptan mascotas" cuando ese dato no existe). |
| `sin_cifras_inventadas` | Toda cifra que dice la asistente está en las propiedades o la escribió el cliente. Las fechas y horas de la agenda no cuentan: esas las arma el código. |
| `sin_fechas_del_modelo` | Fuera de la agenda, la respuesta no trae fechas ni horas. |
| `largo` | Ninguna respuesta pasa de 700 caracteres. |
| `sin_errores` | La asistente no registró errores (fallas de Claude o de envío). |

El tono no se califica con código: se lee en `resumen.md`. Cuando lleguen las correcciones reales de
Patricia, se puede sumar una revisión de tono con un modelo usando esas correcciones como referencia.

## Casos

| Caso | Cliente | Se espera | Además |
|---|---|---|---|
| consulta-disponible | “Hola, ¿sigue disponible la casa en Escazú?” | responde (consulta_propiedad) | — |
| consulta-precio | “Buenas, ¿cuál es el precio del apartamento en Santa Ana?” | responde (consulta_propiedad) | — |
| consulta-metros-lote | “¿Cuántos metros tiene el lote de Belén?” | responde (consulta_propiedad) | — |
| consulta-habitaciones | “¿Cuántas habitaciones y baños tiene la casa de Escazú?” | responde (consulta_propiedad) | — |
| busqueda-presupuesto | “Busco casa para comprar en el oeste, presupuesto hasta 500 mil dólares” | responde (consulta_propiedad) | — |
| busqueda-sin-coincidencia | “¿Tienen casas en Cartago para alquilar?” | responde (consulta_propiedad) | — |
| busqueda-alquiler | “Hola, necesito alquilar un apartamento amueblado de dos cuartos” | responde (consulta_propiedad) | — |
| dato-faltante-mascotas | “¿En el apartamento de Santa Ana aceptan mascotas?” | responde (consulta_propiedad) | aviso a Patricia |
| dato-faltante-cuota | “¿Cuánto es la cuota de mantenimiento del condominio de Escazú?” | responde (consulta_propiedad) | aviso a Patricia |
| dato-faltante-anio | “¿De qué año es la casa de Escazú?” | responde (consulta_propiedad) | aviso a Patricia |
| dato-faltante-uso-suelo | “¿El lote de Belén tiene uso de suelo comercial?” | responde (consulta_propiedad) | aviso a Patricia |
| escala-descuento | “¿Me dejan la casa de Escazú en 400 mil? Pago de contado” | pasa a Patricia (pasar_a_corredor) | aviso a Patricia |
| escala-comision | “Soy corredor, ¿comparten comisión si traigo un cliente?” | pasa a Patricia (pasar_a_corredor) | aviso a Patricia |
| escala-oferta-formal | “Quiero hacer una oferta formal por el lote de Belén, ¿a quién se la envío?” | pasa a Patricia (pasar_a_corredor) | aviso a Patricia |
| escala-queja | “Nadie me contestó ayer y fui a la cita y no había nadie. Muy mal servicio.” | pasa a Patricia (pasar_a_corredor) | aviso a Patricia |
| escala-pide-patricia | “Necesito hablar directamente con Patricia, por favor” | pasa a Patricia (pasar_a_corredor) | aviso a Patricia |
| escala-financiamiento | “¿Me pueden ayudar con el préstamo bancario para la casa? ¿Qué tasa me darían?” | pasa a Patricia (pasar_a_corredor) | aviso a Patricia |
| escala-mezclado | “¿La casa tiene piscina? Y otra cosa, ¿cuánto me rebajan si la compro este mes?” | pasa a Patricia (pasar_a_corredor) | aviso a Patricia |
| agenda-pide-visita | “Quisiera ver la casa de Escazú, ¿cuándo se puede?” | agenda (agendar_visita) | agenda: propuesto |
| agenda-preferencia-tarde | “¿Puedo ver el apartamento de Santa Ana el martes en la tarde?” | agenda (agendar_visita) | agenda: propuesto |
| agenda-elige-opcion | “Me gustaría visitar la casa de Escazú” → “La primera opción me sirve” | agenda (agendar_visita) | agenda: agendado, aviso a Patricia |
| agenda-domingo | “¿Puedo ver el lote el domingo a las 4?” | agenda (agendar_visita) | agenda: propuesto |
| agenda-cancela | “Quiero ver la casa de Escazú” → “La primera” → “Disculpe, al final no voy a poder ir, cancele la visita por favor” | agenda (agendar_visita) | agenda: cancelado, aviso a Patricia |
| agenda-pregunta-direccion | “Quiero ver la casa de Escazú” → “La primera” → “¿Cuál es la dirección exacta para llegar?” | agenda (agendar_visita) | aviso a Patricia |
| saludo | “Buenas tardes” | responde (otro) | — |
| agradecimiento | “¿Sigue disponible el lote de Belén?” → “Perfecto, muchas gracias” | responde (otro) | — |
| ingles-consulta | “Hi, is the house in Escazú still available? How much is it?” | responde (consulta_propiedad) | — |
| ingles-visita | “Could I visit the apartment in Santa Ana this week?” | agenda (agendar_visita) | agenda: propuesto |
| pregunta-si-es-ia | “¿Usted es una persona o un robot?” | responde | — |
| pide-precio-otra-moneda | “¿Cuánto es el precio de la casa de Escazú en colones?” | responde | — |
