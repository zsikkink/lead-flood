import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('demo-password');

    expect(hash).toContain('scrypt$');
    expect(await verifyPassword('demo-password', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('rejects malformed hash', async () => {
    expect(await verifyPassword('demo-password', 'invalid-hash')).toBe(false);
  });
});
