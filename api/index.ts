import type { IncomingMessage, ServerResponse } from 'node:http';
import portalHandler from '../server.ts';

/**
 * Punto de entrada de la API para Vercel Functions.
 *
 * Vercel enruta /api/* hacia esta función. Según la configuración de rewrites,
 * la función puede recibir la ruta de destino (/api/index) en lugar de la
 * ruta original del navegador; en ese caso se restaura desde el parámetro __orig
 * para que el enrutador de Express reciba la URL real (/api/auth/login, etc.).
 */
export default function handler(
  req: IncomingMessage,
  res: ServerResponse
): void {
  const url = req.url || '/';
  if (url.startsWith('/api/index')) {
    const queryPos = url.indexOf('?');
    const params = new URLSearchParams(
      queryPos >= 0 ? url.slice(queryPos + 1) : ''
    );
    const original = params.get('__orig');
    if (original) {
      params.delete('__orig');
      const extra = params.toString();
      req.url = original + (extra ? `?${extra}` : '');
    }
  }

  portalHandler(req, res).catch((err) => {
    console.error('Error en la función de la API:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Error interno del servidor.' }));
    } else {
      res.end();
    }
  });
}
