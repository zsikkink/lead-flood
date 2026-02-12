import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('hashes and verifies a password', () => {
    const hash = hashPassword('demo-password');

    expect(hash).toContain('scrypt$');
    expect(verifyPassword('demo-password', hash)).toBe(true);
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('rejects malformed hash', () => {
    expect(verifyPassword('demo-password', 'invalid-hash')).toBe(false);
  });
});
