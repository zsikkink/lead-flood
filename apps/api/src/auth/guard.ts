import type { FastifyReply, FastifyRequest } from 'fastify';

import { verifyJwt } from './jwt.js';

export interface AuthUser {
  sub: string;
  sid: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export function buildAuthGuard(accessTokenSecret: string) {
  return async function authGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const claims = verifyJwt(token, accessTokenSecret);

    if (!claims) {
      reply.status(401).send({ error: 'Invalid token' });
      return;
    }

    if (claims.type !== 'access') {
      reply.status(401).send({ error: 'Invalid token type' });
      return;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (claims.exp <= nowSeconds) {
      reply.status(401).send({ error: 'Token expired' });
      return;
    }

    request.user = { sub: claims.sub, sid: claims.sid };
  };
}
