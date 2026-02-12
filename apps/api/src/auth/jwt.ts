import { createHmac } from 'node:crypto';

export interface JwtClaims {
  sub: string;
  sid: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signJwt(claims: JwtClaims, secret: string): string {
  const header = encode({
    alg: 'HS256',
    typ: 'JWT',
  });
  const payload = encode(claims);
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');

  return `${header}.${payload}.${signature}`;
}
