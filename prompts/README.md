# Instrucciones del agente

Una instrucción por tarea, en Markdown, versionada con el código. Se cargan en tiempo de ejecución
y se combinan con los datos del corredor (`corredores.tono`, `reglas_escalamiento`, propiedades).

| Archivo | Modelo | Tarea | Semana |
|---|---|---|---|
| `clasificar.md` | Haiku | Intención del mensaje: consulta_propiedad, agendar_visita, otro, pasar_a_corredor | 1 |
| `responder.md` | Sonnet | Respuesta al cliente con el contexto de las propiedades | 1 |
| `agendar.md` | Sonnet | Elegir la acción de agenda (proponer, confirmar, cancelar, confirmar asistencia); el código arma las fechas | 1 |
| `analizar.md` | Sonnet + web_fetch | Análisis de propiedad u oferta (enlace o datos) contra las propiedades del corredor | 1 |
| `anuncio.md` | Sonnet (con visión) | Título y texto en español e inglés, orden de fotos y sugerencias | 2 |
| `foto.md` | OpenAI `gpt-image-2` | Mejora de una foto: solo luz, color, nitidez y verticales, sin cambiar el espacio | 2 |
| `dueno_o_corredor.md` | Haiku | Clasificar un anuncio de Encuentra24 como dueño directo o corredor | 2 |

Ninguna instrucción es específica de Deluxe: lo propio de cada corredor vive en la base de datos.
