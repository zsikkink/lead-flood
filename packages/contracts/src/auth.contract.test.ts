import { describe, expect, it } from 'vitest';

import { LoginRequestSchema, LoginResponseSchema } from './auth.contract.js';

describe('LoginRequestSchema', () => {
  it('accepts a valid payload', () => {
    const parsed = LoginRequestSchema.parse({
      email: 'demo@lead-flood.local',
      password: 'password',
    });

    expect(parsed.email).toBe('demo@lead-flood.local');
  });

  it('rejects invalid email', () => {
    expect(() =>
      LoginRequestSchema.parse({
        email: 'invalid-email',
        password: 'password',
      }),
    ).toThrowError();
  });
});

describe('LoginResponseSchema', () => {
  it('accepts expected response shape', () => {
    const parsed = LoginResponseSchema.parse({
      tokenType: 'Bearer',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresInSeconds: 3600,
      user: {
        id: 'user_1',
        email: 'demo@lead-flood.local',
        firstName: 'Demo',
        lastName: 'User',
      },
    });

    expect(parsed.tokenType).toBe('Bearer');
    expect(parsed.expiresInSeconds).toBe(3600);
  });
});
