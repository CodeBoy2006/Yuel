import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const READING_SITE_HOST = 'reader.example.test';

const execFileAsync = promisify(execFile);

export async function withReadingSite<T>(runTest: (url: string) => Promise<T>): Promise<T> {
  const certificateDir = await mkdtemp(path.join(tmpdir(), 'yuel-reading-site-cert-'));
  const keyPath = path.join(certificateDir, 'key.pem');
  const certPath = path.join(certificateDir, 'cert.pem');

  try {
    await createSelfSignedCertificate(keyPath, certPath);
    const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
    const server = createServer({ cert, key }, (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(createReadingSiteHtml());
    });

    try {
      const port = await listenOnLocalhost(server);
      return await runTest(`https://${READING_SITE_HOST}:${port}/article/yuel`);
    } finally {
      await closeServer(server);
    }
  } finally {
    await rm(certificateDir, { force: true, recursive: true });
  }
}

async function createSelfSignedCertificate(keyPath: string, certPath: string): Promise<void> {
  await execFileAsync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-subj',
    `/CN=${READING_SITE_HOST}`,
    '-addext',
    `subjectAltName=DNS:${READING_SITE_HOST}`,
  ]);
}

function createReadingSiteHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>All-site content script reading loop</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 40px; max-width: 760px; line-height: 1.7; }
      article { min-height: 1400px; }
      p { font-size: 18px; margin: 0 0 24px; }
    </style>
  </head>
  <body>
    <main>
      <article>
        <h1>All-site content script reading loop</h1>
        <p>
          Local first browser extensions can measure careful reading behavior on documentation pages while keeping
          vocabulary exposure, architecture notes, and performance signals inside the user's browser database.
        </p>
        <p>
          This ordinary HTTPS page gives the packaged content script a visible article block long enough to emit
          exposure ticks, persist local reading events, and update the dashboard without manual runtime messages.
        </p>
      </article>
    </main>
  </body>
</html>`;
}

async function listenOnLocalhost(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Local reading site did not expose a TCP address');
  }
  return (address as AddressInfo).port;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
