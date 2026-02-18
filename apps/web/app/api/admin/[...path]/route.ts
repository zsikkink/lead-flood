import type { NextRequest } from 'next/server';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function sanitizeBaseUrl(rawValue: string): string {
  return rawValue.replace(/\/+$/, '');
}

function buildTargetUrl(request: NextRequest, pathSegments: string[]): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured on web server');
  }

  if (pathSegments.length === 0) {
    throw new Error('Missing admin route path');
  }

  const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join('/');
  const search = request.nextUrl.search ?? '';
  return `${sanitizeBaseUrl(apiBaseUrl)}/v1/admin/${encodedPath}${search}`;
}

function buildForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    if (key.toLowerCase() === 'x-admin-key') {
      continue;
    }
    headers.set(key, value);
  }

  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) {
    throw new Error('ADMIN_API_KEY is not configured on web server');
  }
  headers.set('x-admin-key', adminApiKey);

  return headers;
}

function sanitizeResponseHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const [key, value] of source.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

async function proxyAdminRequest(request: NextRequest, params: { path?: string[] }): Promise<Response> {
  let targetUrl: string;
  let headers: Headers;

  try {
    targetUrl = buildTargetUrl(request, params.path ?? []);
    headers = buildForwardHeaders(request);
  } catch (error: unknown) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Admin proxy configuration error',
      },
      { status: 500 },
    );
  }

  try {
    const method = request.method.toUpperCase();
    const body =
      method === 'GET' || method === 'HEAD'
        ? undefined
        : await request.arrayBuffer().then((buffer) => (buffer.byteLength > 0 ? buffer : undefined));

    const init: RequestInit = {
      method,
      headers,
      redirect: 'manual',
    };
    if (body !== undefined) {
      init.body = body;
    }

    const upstreamResponse = await fetch(targetUrl, init);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: sanitizeResponseHeaders(upstreamResponse.headers),
    });
  } catch (error: unknown) {
    return Response.json(
      {
        error: 'Failed to reach upstream admin API',
        detail: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAdminRequest(request, await context.params);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAdminRequest(request, await context.params);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAdminRequest(request, await context.params);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAdminRequest(request, await context.params);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAdminRequest(request, await context.params);
}
