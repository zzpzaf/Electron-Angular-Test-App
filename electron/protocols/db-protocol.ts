
// electron/protocols/db-protocol.ts


// import type { ProtocolRequest, ProtocolResponse } from 'electron';
import { getImageBlobById } from '../dbs/sqlite/mandb_queries';


/**
 * Creates a handler for Electron's registerBufferProtocol('db', handler).
 * Supports: db://image/<id>
 *
 * Example URLs:
 *   db://image/101
 *   db://image/42?cache=bust  (query is ignored)
 */
export function createDbProtocolHandlerFetch() {
  // Handler for protocol.handle('db', handler)
  return async (request: Request): Promise<Response> => {
    try {
      console.log('>===>> [db protocol] request.url:', request.url);
      // request.url example: db://image/101
      const url = new URL(request.url);
      console.log('>===>> [db protocol] request.url pathname:', url.pathname);
      const parts = url.pathname.split('/').filter(Boolean); // ["image","101"]

      // if (parts.length !== 2 || parts[0] !== 'image') {
      //   console.log('>===>> [db protocol] request.url:', request.url, ' - parts nr: ', parts.length);
      //   return new Response('', { status: 404 });
      // }
      if (parts.length !== 1 ) {
        console.log('>===>> [db protocol] request.url:', request.url, ' - parts nr: ', parts.length);
        return new Response('', { status: 404 });
      }
      
      
      // const id = Number(parts[1]);
      const id = Number(parts[0]);
      if (!Number.isInteger(id) || id < 1) {
        return new Response('', { status: 400 });
      }

      // *** Fetch the image blob from the database ***
      const row = getImageBlobById(id);
      if (!row || !row.imgBlob) {
        console.log('>===>> getImageBlobById: No image found for id:', id);
        return new Response('', { status: 404 });
      }

    // Convert Buffer -> Uint8Array view (using the exact window)
    const body = new Uint8Array(
    row.imgBlob.buffer as ArrayBuffer,     // cast away the SharedArrayBuffer union
    row.imgBlob.byteOffset,
    row.imgBlob.byteLength
    );
    return new Response(body, {
    status: 200,
    headers: { 'Content-Type': row.mime_type }
    });
      
    } catch (err) {
      console.error('[db protocol] handler error:', err);
      return new Response('', { status: 500 });
    }
  };
}
