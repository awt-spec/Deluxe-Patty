// Páginas de verificación ficticias, con las señales que muestran Cloudflare y los captchas (sin contenido real de
// Encuentra24). Las usan las pruebas de la extensión y la prueba en Chromium (scripts/probar-buscador.mts).

/** Desafío de Cloudflare ("Un momento…"). */
export const DESAFIO_CLOUDFLARE = `<!DOCTYPE html><html lang="es"><head><title>Un momento…</title></head><body>
<div class="main-wrapper"><h1>www.encuentra24.com</h1><p>Verifica que eres humano. Esto puede tardar unos segundos.</p>
<div id="challenge-stage"><div class="cf-turnstile"></div></div></div>
<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=0000"></script></body></html>`;

/** Recuadro de captcha sin Cloudflare. */
export const CAPTCHA = `<!DOCTYPE html><html><head><title>Comprobación</title></head><body>
<form><p>Confirma que eres humano para seguir.</p><div class="g-recaptcha" data-sitekey="ficticia"></div></form></body></html>`;

/** Demasiadas visitas (sin contenido; el código 429 lo da la respuesta). */
export const DEMASIADAS = `<!DOCTYPE html><html><head><title>429 Too Many Requests</title></head><body><h1>Too Many Requests</h1></body></html>`;

/** Un listado normal que menciona un captcha en sus scripts (formulario de contacto): NO es verificación. */
export const LISTADO_CON_CAPTCHA = `<!DOCTYPE html><html><head><title>Casas en venta</title></head><body>
<script src="https://www.google.com/recaptcha/api.js"></script>
<script>self.__next_f.push([1,"5:[\\"$\\",\\"div\\",null,{\\"ads\\":[]}]\\n"])</script></body></html>`;
