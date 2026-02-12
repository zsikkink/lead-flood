import { describe, expect, it, vi } from 'vitest';

import type { LoginRequest } from '@lead-flood/contracts';

import { hashPassword } from './password.js';
import { buildAuthenticateUser } from './service.js';

const validLogin: LoginRequest = {
  email: 'demo@lead-flood.local',
  password: 'demo-password',
};

describe('buildAuthenticateUser', () => {
  it('returns tokens and persists session for valid credentials', async () => {
    const createSession = vi.fn(async () => {});
    const authenticateUser = buildAuthenticateUser({
      findUserByEmail: async () => ({
        id: 'user_1',
        email: 'demo@lead-flood.local',
        firstName: 'Demo',
        lastName: 'User',
        passwordHash: hashPassword('demo-password'),
        isActive: true,
      }),
      createSession,
      accessTokenSecret: 'test-access-secret-test-access-secret',
      refreshTokenSecret: 'test-refresh-secret-test-refresh-secret',
    });

    const response = await authenticateUser(validLogin);

    expect(response).not.toBeNull();
    expect(response?.tokenType).toBe('Bearer');
    expect(response?.accessToken).toBeTruthy();
    expect(response?.refreshToken).toBeTruthy();
    expect(response?.expiresInSeconds).toBe(3600);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        refreshToken: response?.refreshToken,
      }),
    );
  });

  it('returns null for invalid credentials', async () => {
    const createSession = vi.fn(async () => {});
    const authenticateUser = buildAuthenticateUser({
      findUserByEmail: async () => ({
        id: 'user_1',
        email: 'demo@lead-flood.local',
        firstName: 'Demo',
        lastName: 'User',
        passwordHash: hashPassword('demo-password'),
        isActive: true,
      }),
      createSession,
      accessTokenSecret: 'test-access-secret-test-access-secret',
      refreshTokenSecret: 'test-refresh-secret-test-refresh-secret',
    });

    const response = await authenticateUser({
      email: 'demo@lead-flood.local',
      password: 'wrong-password',
    });

    expect(response).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns null for inactive user', async () => {
    const authenticateUser = buildAuthenticateUser({
      findUserByEmail: async () => ({
        id: 'user_1',
        email: 'demo@lead-flood.local',
        firstName: 'Demo',
        lastName: 'User',
        passwordHash: hashPassword('demo-password'),
        isActive: false,
      }),
      createSession: async () => {},
      accessTokenSecret: 'test-access-secret-test-access-secret',
      refreshTokenSecret: 'test-refresh-secret-test-refresh-secret',
    });

    const response = await authenticateUser(validLogin);

    expect(response).toBeNull();
  });
});
