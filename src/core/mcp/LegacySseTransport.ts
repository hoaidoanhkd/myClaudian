import type { FetchLike, Transport } from '@modelcontextprotocol/client';
import * as McpClientModule from '@modelcontextprotocol/client';

export function createLegacySseTransport(
  url: URL,
  options: { fetch: FetchLike; requestInit?: RequestInit },
): Transport {
  const Ctor = (McpClientModule as Record<string, unknown>)['SSEClientTransport'];
  if (typeof Ctor !== 'function') {
    throw new Error('The MCP client does not support legacy SSE transports');
  }
  return new (Ctor as new (url: URL, opts: unknown) => Transport)(url, options);
}

