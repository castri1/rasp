#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  createGoogleConfigStore,
  publicGoogleConfig,
  validateGoogleConfig,
} from '../server/googleCalendar.mjs';

const usage = `Uso:
  node scripts/import-google-client.mjs <archivo-oauth.json>

El archivo debe ser el JSON descargado de un cliente OAuth de Google de tipo
«Aplicación de escritorio». El secreto nunca se muestra en pantalla.`;

function desktopCredentials(document) {
  if (!document || typeof document !== 'object' || !document.installed) {
    throw new Error('El JSON no corresponde a una «Aplicación de escritorio» de Google.');
  }

  return {
    clientId: document.installed.client_id,
    clientSecret: document.installed.client_secret,
  };
}

async function main() {
  const source = process.argv[2];
  if (!source || process.argv.length !== 3) throw new Error(usage);

  let document;
  try {
    document = JSON.parse(await readFile(resolve(source), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`No encontré el archivo: ${resolve(source)}`);
    if (error instanceof SyntaxError) throw new Error('El archivo no contiene JSON válido.');
    throw error;
  }

  const configFile = process.env.RASP_GOOGLE_CONFIG
    ? resolve(process.env.RASP_GOOGLE_CONFIG)
    : join(homedir(), '.local/share/rasp/.rasp/google-calendar.json');
  const store = createGoogleConfigStore(configFile);
  const previous = await store.load();
  const config = validateGoogleConfig(desktopCredentials(document), previous);

  await store.save(config);

  const visible = publicGoogleConfig(config);
  console.log('Credenciales de Google Calendar importadas correctamente.');
  console.log(`ID: ${visible.clientIdHint}`);
  console.log(`Guardadas en: ${configFile}`);
  console.log('El secreto quedó protegido con permisos privados y no se mostró en pantalla.');
}

main().catch(error => {
  console.error(`\nNo se pudieron importar las credenciales.\n${error.message}\n`);
  process.exitCode = 1;
});
