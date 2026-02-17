# Testing Patterns

**Analysis Date:** 2026-02-17

## Test Framework

**Runner:**
- Vitest 3.0.4
- Config: No explicit `vitest.config.ts` in codebase - uses Vitest defaults
- Workspace integration: Each app/package runs tests via `vitest run` or `vitest run [path]`

**Assertion Library:**
- Vitest built-in expect() API (compatible with Jest)
- All tests use `expect()` from vitest

**Run Commands:**
```bash
pnpm test                    # Run all tests (unit + integration) in all packages
pnpm test:unit               # Unit tests only
pnpm test:integration        # Integration tests only (requires PostgreSQL)
pnpm test:e2e                # End-to-end tests (requires PostgreSQL)

# Within specific package (e.g., apps/api):
vitest run src               # Unit tests in src/
vitest run test/integration  # Integration tests
vitest run test/e2e          # E2E tests
```

**Environment for Integration/E2E Tests:**
```bash
DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5434/lead_flood}
DIRECT_URL=${DIRECT_URL:-postgresql://postgres:postgres@localhost:5434/lead_flood}
PG_BOSS_SCHEMA=${PG_BOSS_SCHEMA:-pgboss}
```

## Test File Organization

**Location:**
- Unit tests: co-located with source files (`src/[module]/[feature].test.ts`)
- Integration tests: separate `test/integration/` directory
- E2E tests: separate `test/e2e/` directory
- Pattern allows parallel directory structures in same package

**Naming:**
- Unit tests: `[module].test.ts` (e.g., `auth/service.test.ts`)
- Integration tests: `[feature].integration.test.ts` (e.g., `auth.integration.test.ts`)
- E2E tests: `[feature].e2e.test.ts` (e.g., `lead-flow.e2e.test.ts`)

**Structure:**
```
apps/api/
├── src/
│   ├── auth/
│   │   ├── service.ts
│   │   ├── service.test.ts        # Unit test, co-located
│   │   ├── password.ts
│   │   └── password.test.ts
│   └── server.ts
│   └── server.test.ts
└── test/
    ├── integration/
    │   ├── auth.integration.test.ts
    │   ├── discovery.run.integration.test.ts
    │   └── qualification.rules.integration.test.ts
    └── e2e/
        └── lead-flow.e2e.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('buildAuthenticateUser', () => {
  it('returns tokens and persists session for valid credentials', async () => {
    // Arrange
    const createSession = vi.fn(async () => {});
    const authenticateUser = buildAuthenticateUser({
      findUserByEmail: async () => ({ /* user data */ }),
      createSession,
      accessTokenSecret: 'test-secret',
      refreshTokenSecret: 'test-secret',
    });

    // Act
    const response = await authenticateUser({ email: 'test@example.com', password: 'pwd' });

    // Assert
    expect(response).not.toBeNull();
    expect(response?.tokenType).toBe('Bearer');
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('returns null for invalid credentials', async () => {
    // Test with wrong password
  });

  it('returns null for inactive user', async () => {
    // Test with isActive: false
  });
});
```

**Patterns:**
- Each test file has single `describe()` block wrapping related tests
- One `it()` per specific behavior/assertion group
- Descriptive test names: action + condition + expected result
- Async/await for async operations - no promise chaining
- Return statements not used unless Promise needed

**Setup & Teardown:**

Unit tests (no beforeEach needed for mock-only tests):
```typescript
const createSession = vi.fn(async () => {});
const authenticateUser = buildAuthenticateUser({
  findUserByEmail: async () => ({ /* mocked user */ }),
  createSession,
  // ...
});
```

Integration tests (require cleanup):
```typescript
describe('POST /v1/auth/login integration', () => {
  const userEmail = `integration-auth-${Date.now()}@lead-flood.local`;

  afterEach(async () => {
    await prisma.session.deleteMany({
      where: { user: { email: userEmail } },
    });
    await prisma.user.deleteMany({
      where: { email: userEmail },
    });
  });

  it('authenticates a stored user', async () => {
    // Test implementation
  });
});
```

**Cleanup Pattern:**
- Use `afterEach()` for database cleanup
- Track created IDs in array: `const createdIds: string[] = []`
- Cleanup in afterEach with splice: `prisma.entity.deleteMany({ where: { id: { in: createdIds.splice(...) } } })`
- Prevents cascade issues and test data pollution

## Mocking

**Framework:** Vitest's built-in `vi` object

**Patterns:**

Function mocking:
```typescript
const createSession = vi.fn(async () => {});
expect(createSession).toHaveBeenCalledTimes(1);
expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1' }));
```

Type casting with mocks:
```typescript
const boss = { send: vi.fn(async () => 'ok') };
await dispatchPendingOutboxEvents(boss as unknown as Pick<PgBoss, 'send'>, logger);
```

Logger mocking:
```typescript
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
```

**What to Mock:**
- External dependencies: database clients, API clients, queue systems (use vi.fn())
- I/O operations: file system, network calls
- Time-sensitive operations: `Date.now()`, timers (use `vi.useFakeTimers()` if needed)

**What NOT to Mock:**
- Business logic functions being tested - call them real
- Pure utility functions - call them real for integration
- Zod schema validation - call real to catch schema changes
- Error classes - instantiate real, don't mock

## Fixtures and Factories

**Test Data Pattern:**
```typescript
async function createQueuedJobFixture() {
  const lead = await prisma.lead.create({
    data: {
      firstName: 'Worker',
      lastName: 'Test',
      email: `worker-outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@lead-flood.local`,
      source: 'test',
      status: 'new',
    },
  });

  return {
    leadId: lead.id,
    jobExecutionId: jobExecution.id,
  };
}
```

**Location:**
- Helper functions defined inline in test file
- Use when fixture setup is test-specific
- Track IDs at suite level for cleanup: `const createdLeadIds: string[] = []`

**Uniqueness:**
- Use `Date.now()` + random suffix for unique email: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@lead-flood.local`
- Prevents test parallelism conflicts
- Each integration test creates unique data, cleans up after

## Coverage

**Requirements:** Not explicitly enforced in codebase

**View Coverage:**
- Not configured in test scripts
- Add with: `vitest run --coverage` (requires coverage provider)

**Current Practice:**
- Unit tests focus on critical business logic (auth, validation, error handling)
- Integration tests focus on data flow and repository patterns
- E2E tests focus on user-facing flows

## Test Types

**Unit Tests:**
- Scope: Single function/module in isolation
- Dependencies: Mocked via dependency injection
- Location: `src/[module]/[feature].test.ts`
- Speed: Fast (milliseconds)
- Examples:
  - `apps/api/src/auth/service.test.ts` - buildAuthenticateUser with mocked deps
  - `apps/api/src/auth/password.test.ts` - hash/verify password pure functions
  - `packages/contracts/src/auth.contract.test.ts` - Zod schema validation

**Integration Tests:**
- Scope: Multiple modules + real database
- Dependencies: Real Prisma client, Fastify server
- Location: `test/integration/[feature].integration.test.ts`
- Speed: Moderate (seconds, requires PostgreSQL)
- Setup: Create test data, call endpoints/functions, assert side effects
- Cleanup: afterEach with prisma deleteMany
- Examples:
  - `apps/api/test/integration/auth.integration.test.ts` - full login flow with database
  - `apps/api/test/integration/discovery.run.integration.test.ts` - discovery pipeline with ICP profiles
  - `apps/worker/test/integration/outbox-retry-recovery.integration.test.ts` - message dispatch with database state

**E2E Tests:**
- Scope: Full user journey across services
- Dependencies: Running API, Worker, database
- Location: `test/e2e/[feature].e2e.test.ts`
- Speed: Slow (many seconds, full system startup)
- Examples:
  - `apps/api/test/e2e/lead-flow.e2e.test.ts` - lead creation through enrichment/scoring

## Common Patterns

**Async Testing:**
```typescript
it('authenticates a stored user', async () => {
  // All test code is async/await
  const response = await authenticateUser({ email, password });
  expect(response).not.toBeNull();

  // Integration: database queries
  const session = await prisma.session.findUnique({ where: { refreshToken } });
  expect(session?.userId).toBe(response!.user.id);
});
```

**Error Testing:**
```typescript
it('rejects invalid email', () => {
  expect(() =>
    LoginRequestSchema.parse({
      email: 'invalid-email',
      password: 'password',
    }),
  ).toThrowError();
});
```

**Null/Optional Testing:**
```typescript
it('returns null for invalid credentials', async () => {
  const response = await authenticateUser(invalidLogin);
  expect(response).toBeNull();
});
```

**Mock Verification:**
```typescript
it('marks pending outbox events as sent when publish succeeds', async () => {
  const boss = { send: vi.fn(async () => 'ok') };
  const count = await dispatchPendingOutboxEvents(boss, logger);

  expect(count).toBe(1);
  expect(boss.send).toHaveBeenCalledTimes(1);

  // Verify state changed in database
  const updated = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
  expect(updated?.status).toBe('sent');
  expect(updated?.attempts).toBe(1);
});
```

**Fixture Cleanup:**
```typescript
it('test using fixtures', async () => {
  const fixture = await createQueuedJobFixture();
  createdLeadIds.push(fixture.leadId);  // Track for cleanup

  // Test code using fixture

  // Cleanup happens in afterEach
});

afterEach(async () => {
  if (createdLeadIds.length > 0) {
    await prisma.lead.deleteMany({
      where: { id: { in: createdLeadIds.splice(0, createdLeadIds.length) } },
    });
  }
});
```

---

*Testing analysis: 2026-02-17*
