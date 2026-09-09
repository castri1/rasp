import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const piBundle = resolve(fileURLToPath(new URL('../artifacts/rasp-pi.tar.gz', import.meta.url)));
const portValue = Number.parseInt(process.env.RASP_PREVIEW_PORT || '4173', 10);
const port = Number.isInteger(portValue) && portValue > 0 && portValue <= 65535 ? portValue : 4173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.gz': 'application/gzip',
};

function headers(type) {
  return {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/preview-diagnostic' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) break;
    }
    try {
      const diagnostic = JSON.parse(body);
      console.log(`Diagnóstico recibido desde ${req.socket.remoteAddress}:`);
      console.log(JSON.stringify(diagnostic, null, 2));
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
    } catch {
      res.writeHead(400, headers('text/plain; charset=utf-8'));
      res.end('Diagnóstico no válido.');
    }
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method ?? '')) {
    res.writeHead(405, headers('text/plain; charset=utf-8'));
    res.end('Método no permitido.');
    return;
  }

  try {
    if (pathname.startsWith('/api/')) {
      res.writeHead(404, headers('application/json; charset=utf-8'));
      res.end(JSON.stringify({ message: 'Los servicios privados están desactivados en la vista previa de red local.' }));
      return;
    }

    if (pathname === '/downloads/rasp-pi.tar.gz') {
      if (!(await stat(piBundle)).isFile()) throw new Error('Not found');
      res.writeHead(200, {
        ...headers('application/gzip'),
        'Content-Disposition': 'attachment; filename="rasp-pi.tar.gz"',
      });
      res.end(req.method === 'HEAD' ? undefined : await readFile(piBundle));
      return;
    }

    if (pathname === '/downloads/install-rasp.sh') {
      const requestHost = req.headers.host ?? '';
      if (!/^[a-zA-Z0-9.:[\]-]+$/.test(requestHost)) {
        res.writeHead(400, headers('text/plain; charset=utf-8'));
        res.end('Dirección de descarga no válida.');
        return;
      }
      const script = `#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="$HOME/rasp-pi.tar.gz"
SOURCE_DIR="$HOME/rasp-install"

echo "Descargando Rasp..."
wget --output-document="$ARCHIVE" "http://${requestHost}/downloads/rasp-pi.tar.gz"
mkdir -p "$SOURCE_DIR"
tar -xzf "$ARCHIVE" -C "$SOURCE_DIR" --strip-components=1
bash "$SOURCE_DIR/deploy/pi/install.sh" "$SOURCE_DIR"
`;
      res.writeHead(200, {
        ...headers('text/x-shellscript; charset=utf-8'),
        'Content-Disposition': 'attachment; filename="install-rasp.sh"',
      });
      res.end(req.method === 'HEAD' ? undefined : script);
      return;
    }

    const requested = pathname === '/' || pathname === '/app' || pathname === '/app/' ? '/index.html' : pathname;
    const file = resolve(root, `.${requested}`);
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('Not found');

    res.writeHead(200, headers(types[extname(file)] ?? 'application/octet-stream'));
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch {
    res.writeHead(404, headers('text/plain; charset=utf-8'));
    res.end('No encontrado.');
  }
});

server.listen(port, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter(address => address?.family === 'IPv4' && !address.internal)
    .map(address => `http://${address.address}:${port}/app`);

  console.log('Vista previa de Rasp disponible en la red local:');
  for (const address of addresses) console.log(`  ${address}`);
  console.log('Solo sirve la interfaz; las acciones privadas del Mac y Alexa permanecen desactivadas.');
});
