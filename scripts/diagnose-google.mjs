#!/usr/bin/env node
// Diagnóstico de la conexión con Google Calendar. Ejecútalo EN LA RASPBERRY:
//   node ~/.local/share/rasp/server/../scripts/diagnose-google.mjs
// o, si solo copiaste este archivo:  node diagnose-google.mjs
// No imprime el secreto ni el refresh token completos.

import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = process.env.RASP_REDIRECT_URI || 'http://127.0.0.1:4173/api/calendar/oauth/callback';
const marks = { ok: '✅', bad: '❌', warn: '⚠️ ', info: '·' };
let problems = 0;

function say(mark, text, extra = '') {
  if (mark === 'bad') problems += 1;
  console.log(`${marks[mark]} ${text}${extra ? `\n     ${extra}` : ''}`);
}

function mask(value, keep = 6) {
  if (!value) return '(vacío)';
  return `${value.slice(0, keep)}…${value.slice(-4)} (${value.length} caracteres)`;
}

async function findConfig() {
  const candidates = [
    process.argv[2],
    join(homedir(), '.local/share/rasp/.rasp/google-calendar.json'),
    resolve('.rasp/google-calendar.json'),
    join(homedir(), 'rasp-deploy/.rasp/google-calendar.json'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const info = await stat(file);
      if (info.isFile()) return { file, mode: (info.mode & 0o777).toString(8) };
    } catch { /* siguiente candidato */ }
  }
  return null;
}

async function post(parameters) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters),
    signal: AbortSignal.timeout(15_000),
  });
  let data = {};
  try { data = await response.json(); } catch { /* respuesta no JSON */ }
  return { status: response.status, date: response.headers.get('date'), data };
}

console.log('\n── Diagnóstico de Google Calendar en Rasp ──\n');

// 1. Credenciales guardadas
const found = await findConfig();
if (!found) {
  say('bad', 'No encontré el archivo de credenciales.', 'Esperaba ~/.local/share/rasp/.rasp/google-calendar.json. Guárdalas desde Ajustes → Calendario.');
  process.exit(1);
}
say('ok', `Credenciales en ${found.file}`, `permisos ${found.mode}${found.mode === '600' ? '' : ' (deberían ser 600)'}`);

let config;
try {
  config = JSON.parse(await readFile(found.file, 'utf8'));
} catch (error) {
  say('bad', 'El archivo de credenciales no es JSON válido.', String(error.message));
  process.exit(1);
}

const clientId = String(config.clientId || '');
const clientSecret = String(config.clientSecret || '');
const refreshToken = String(config.refreshToken || '');

console.log(`${marks.info} ID de cliente:  ${mask(clientId, 12)}`);
console.log(`${marks.info} Secreto:        ${mask(clientSecret, 7)}`);
console.log(`${marks.info} Refresh token:  ${refreshToken ? mask(refreshToken, 6) : '(no conectado todavía)'}`);
console.log(`${marks.info} Cuenta:         ${config.account || '(ninguna)'}\n`);

if (!/\.apps\.googleusercontent\.com$/.test(clientId)) say('bad', 'El ID de cliente no termina en .apps.googleusercontent.com.');
if (/\s/.test(clientSecret)) say('bad', 'El secreto contiene espacios: se copió mal.');
if (clientSecret && !clientSecret.startsWith('GOCSPX-')) {
  say('warn', 'El secreto no empieza por GOCSPX-.', 'Los secretos actuales de Google usan ese prefijo. Puede ser antiguo o estar incompleto.');
}

// 2. Reloj del sistema (la Pi 3B no tiene reloj de batería)
try {
  const probe = await fetch('https://oauth2.googleapis.com/token', { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
  const remote = Date.parse(probe.headers.get('date') || '');
  if (Number.isFinite(remote)) {
    const skew = Math.abs(Date.now() - remote) / 1000;
    if (skew > 120) say('bad', `El reloj de la Raspberry está desfasado ${Math.round(skew)} s frente a Google.`, 'Corrígelo con: sudo timedatectl set-ntp true && sudo systemctl restart systemd-timesyncd');
    else say('ok', `Reloj sincronizado (desfase ${Math.round(skew)} s).`);
  }
} catch (error) {
  say('bad', 'No pude contactar oauth2.googleapis.com.', `${error.name}: ${error.message}. Revisa DNS, proxy o firewall de la red.`);
}

// 3. ¿Google reconoce este cliente? Un código inválido distingue el fallo de credenciales del de código.
try {
  const probe = await post({
    client_id: clientId,
    client_secret: clientSecret,
    code: 'rasp-diagnostico-codigo-invalido',
    code_verifier: 'rasp-diagnostico-verificador-invalido-suficientemente-largo',
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });
  const error = probe.data.error || '(sin código)';
  const detail = probe.data.error_description || '';
  console.log(`\n${marks.info} Sonda al endpoint de token → HTTP ${probe.status} · ${error}${detail ? ` · ${detail}` : ''}`);

  if (error === 'invalid_grant') {
    say('ok', 'Google acepta el ID y el secreto, y acepta el retorno a 127.0.0.1.', 'El par de credenciales es correcto y el tipo de cliente sirve. El fallo está en el consentimiento o en el código de autorización.');
  } else if (error === 'invalid_client') {
    say('bad', 'Google no acepta este par ID + secreto.', 'El secreto no corresponde al ID, se copió incompleto, o el cliente fue eliminado. Crea un cliente nuevo de tipo «Aplicación de escritorio» y vuelve a pegarlo.');
  } else if (error === 'unauthorized_client' || error === 'redirect_uri_mismatch') {
    say('bad', `El cliente OAuth no admite este flujo (${error}).`, `El cliente NO es de tipo «Aplicación de escritorio», o no acepta ${REDIRECT_URI}. Crea uno nuevo de tipo Aplicación de escritorio.`);
  } else if (error === 'invalid_request') {
    say('warn', 'Google devolvió invalid_request en la sonda.', detail || 'Revisa el tipo de cliente OAuth.');
  } else {
    say('warn', `Respuesta inesperada de la sonda: ${error}.`, detail);
  }
} catch (error) {
  say('bad', 'La sonda al endpoint de token falló por red.', `${error.name}: ${error.message}`);
}

// 4. ¿Sirve el refresh token guardado?
if (refreshToken) {
  try {
    const probe = await post({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
    if (probe.status === 200 && probe.data.access_token) say('ok', 'El refresh token guardado sigue siendo válido: la agenda debería sincronizar.');
    else say('bad', `El refresh token guardado ya no sirve (${probe.data.error || probe.status}).`, `${probe.data.error_description || ''} Desconecta y vuelve a conectar desde Ajustes → Calendario.`);
  } catch (error) {
    say('bad', 'No pude validar el refresh token.', `${error.name}: ${error.message}`);
  }
}

// 5. ¿Está viva la aplicación en el puerto esperado?
try {
  const response = await fetch('http://127.0.0.1:4173/api/calendar/status', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
  say(response.ok ? 'ok' : 'bad', `El servicio Rasp responde en 127.0.0.1:4173 (HTTP ${response.status}).`);
} catch {
  say('bad', 'El servicio Rasp no responde en 127.0.0.1:4173.', 'Arráncalo con: sudo systemctl restart rasp && journalctl -u rasp -n 50');
}

console.log(`\n── ${problems ? `${problems} problema(s) detectado(s)` : 'Sin problemas detectados en esta capa'} ──\n`);
