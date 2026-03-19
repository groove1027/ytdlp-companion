import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

export const DIST_ROOT = path.join(process.cwd(), 'src', 'dist');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function getContentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function resolveDistFile(rootDir, requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.join(rootDir, relativePath);
  const stat = await fs.stat(filePath).catch(() => null);
  if (stat?.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  return filePath;
}

export async function findBuiltAsset(prefix, rootDir = DIST_ROOT) {
  const assetDir = path.join(rootDir, 'assets');
  const names = await fs.readdir(assetDir);
  const match = names.find((name) => name.startsWith(prefix) && name.endsWith('.js'));
  if (!match) {
    throw new Error(`Built asset not found for prefix: ${prefix}`);
  }
  return path.join(assetDir, match);
}

export async function startDistServer(rootDir = DIST_ROOT) {
  const server = http.createServer(async (req, res) => {
    try {
      const filePath = await resolveDistFile(rootDir, req.url || '/');
      const data = await fs.readFile(filePath);
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': getContentType(filePath),
      });
      res.end(data);
    } catch {
      res.writeHead(404, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Not Found');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve dist server address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

export async function getBuiltModuleUrls(baseUrl, rootDir = DIST_ROOT) {
  const nleModulePath = await findBuiltAsset('nleExportService-', rootDir);
  const jszipModulePath = await findBuiltAsset('jszip.min-', rootDir);

  return {
    appUrl: new URL('index.html', baseUrl).href,
    jszipModuleUrl: new URL(`assets/${path.basename(jszipModulePath)}`, baseUrl).href,
    nleModuleUrl: new URL(`assets/${path.basename(nleModulePath)}`, baseUrl).href,
  };
}
