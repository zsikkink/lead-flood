import { describe, expect, it } from 'vitest';

import {
  CreateLeadRequestSchema,
  CreateLeadResponseSchema,
  GetJobStatusResponseSchema,
  GetLeadResponseSchema,
} from './leads.contract.js';

describe('CreateLeadRequestSchema', () => {
  it('accepts valid input', () => {
    const parsed = CreateLeadRequestSchema.parse({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      source: 'manual',
    });

    expect(parsed.email).toBe('ada@example.com');
  });

  it('rejects invalid email', () => {
    expect(() =>
      CreateLeadRequestSchema.parse({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'invalid',
        source: 'manual',
      }),
    ).toThrowError();
  });
});

describe('CreateLeadResponseSchema', () => {
  it('accepts response payload', () => {
    const parsed = CreateLeadResponseSchema.parse({
      leadId: 'lead_1',
      jobId: 'job_1',
    });

    expect(parsed.leadId).toBe('lead_1');
  });
});

describe('GetLeadResponseSchema', () => {
  it('accepts lead status payload', () => {
    const parsed = GetLeadResponseSchema.parse({
      id: 'lead_1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      source: 'manual',
      status: 'new',
      enrichmentData: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(parsed.status).toBe('new');
  });
});

describe('GetJobStatusResponseSchema', () => {
  it('accepts job status payload', () => {
    const now = new Date().toISOString();
    const parsed = GetJobStatusResponseSchema.parse({
      id: 'job_1',
      type: 'lead.enrich.stub',
      status: 'queued',
      attempts: 0,
      leadId: 'lead_1',
      result: null,
      error: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
    });

    expect(parsed.type).toBe('lead.enrich.stub');
  });
});
