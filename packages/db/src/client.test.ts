import { describe, expect, it } from 'vitest';

import { prisma } from './client.js';

describe('prisma client singleton', () => {
  it('exports a defined prisma client instance', () => {
    expect(prisma).toBeDefined();
  });
});
