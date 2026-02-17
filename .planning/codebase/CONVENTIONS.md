# Coding Conventions

**Analysis Date:** 2026-02-17

## Naming Patterns

**Files:**
- Services: `[feature].service.ts` (e.g., `auth/service.ts`, `discovery/discovery.service.ts`)
- Repositories: `[feature].repository.ts` (e.g., `icp/icp.repository.ts`)
- Routes: `[feature].routes.ts` (e.g., `discovery/discovery.routes.ts`)
- Errors: `[feature].errors.ts` (e.g., `analytics/analytics.errors.ts`)
- Jobs: `[job-name].job.ts` (e.g., `features.compute.job.ts`)
- Test files: `[filename].test.ts` or `[filename].integration.test.ts` or `[filename].e2e.test.ts`
- Utilities: `[utility-name].ts` (e.g., `password.ts`, `jwt.ts`)

**Functions:**
- camelCase, starting with lowercase
- Descriptive verb-noun pattern: `findUserByEmail`, `createLeadAndEnqueue`, `buildAuthenticateUser`
- Factory/builder functions: `build[Domain]` (e.g., `buildAuthenticateUser`, `buildAnalyticsService`)
- Handler functions: explicit verb + subject (e.g., `dispatchPendingOutboxEvents`, `handleFeaturesComputeJob`)
- Private/local functions: prefix with underscore only when explicitly private

**Variables:**
- Constants: UPPER_SNAKE_CASE (e.g., `ACCESS_TOKEN_TTL_SECONDS`, `FEATURE_EXTRACTOR_VERSION`)
- Booleans: is/has prefix (e.g., `isActive`, `hasEmail`, `hasWhatsapp`)
- camelCase for everything else
- Unused parameters: prefix with `_` (e.g., `_exceptedFields`, following ESLint config)

**Types:**
- Interfaces: PascalCase (e.g., `AuthenticateUserDependencies`, `FeaturesComputeJobPayload`)
- Type aliases: PascalCase (e.g., `ApiEnv`, `DiscoveryFilterContext`)
- Union/enum-like types: PascalCase
- Utility types: PascalCase with descriptive names (e.g., `LoginRequest`, `LoginResponse`)

## Code Style

**Formatting:**
- Tool: Prettier 3.4.2
- Settings:
  - Single quotes: true
  - Semicolons: true
  - Trailing commas: all
  - Print width: 100 characters
- Config file: `.prettierrc.json`

**Linting:**
- Tool: ESLint 9.19.0 (flat config format)
- Config file: `eslint.config.mjs`
- Key rules enforced:
  - `@typescript-eslint/no-explicit-any`: error - explicit types required
  - `@typescript-eslint/consistent-type-imports`: error - use `import type` for types
  - `@typescript-eslint/no-unused-vars`: error with `argsIgnorePattern: '^_'` and `varsIgnorePattern: '^_'` - unused variables prefixed with underscore are permitted
- Ignored patterns: `dist/`, `.next/`, `node_modules/`, `coverage/`, `.turbo/`, `next-env.d.ts`

**TypeScript:**
- Strict mode: enabled
- Target: ES2022
- Module: NodeNext with ES module interop
- Key compiler options:
  - `noUncheckedIndexedAccess: true` - safer object/array access
  - `noImplicitOverride: true` - explicit override keyword required
  - `noFallthroughCasesInSwitch: true` - case statements must have breaks
  - `exactOptionalPropertyTypes: true` - optional properties strictly enforced
- Config file: `tsconfig.base.json` (monorepo base), individual `tsconfig.json` per package

## Import Organization

**Order:**
1. Node.js built-in modules (e.g., `import { randomBytes } from 'node:crypto'`)
2. Third-party packages (e.g., `import pino from 'pino'`)
3. Internal packages with @-alias (e.g., `import { prisma } from '@lead-flood/db'`)
4. Relative imports using .js extension (e.g., `import { signJwt } from './jwt.js'`)
5. Type imports at bottom (ESLint `consistent-type-imports` enforces `import type` for types)

**Path Aliases:**
- Used via TypeScript path mapping (see `tsconfig.base.json`)
- `@lead-flood/[package]` - workspace package imports
- Relative imports in same workspace: use `./` with `.js` extension (module format)
- Example: `import { prisma } from '@lead-flood/db';` or `import { buildServer } from './server.js';`

## Error Handling

**Patterns:**
- Custom Error classes extend `Error` with explicit `name` property set in constructor
- Example from `apps/api/src/modules/discovery/discovery.errors.ts`:
```typescript
export class DiscoveryNotImplementedError extends Error {
  constructor(message = 'Discovery module is not implemented yet') {
    super(message);
    this.name = 'DiscoveryNotImplementedError';
  }
}
```
- Domain-specific errors organized in `[feature].errors.ts` files
- NotImplementedError pattern used for stub/placeholder implementations with `TODO` comments
- NotFoundError pattern used for resource lookup failures
- Concrete error types (LeadAlreadyExistsError, DiscoveryRunNotFoundError) for specific business logic

**Error Usage:**
- Throw domain-specific errors for business logic violations
- Use generic `Error` only for environment validation or truly unexpected cases
- Always set `this.name` property for error identification in logs and monitoring

## Logging

**Framework:** Pino (via `@lead-flood/observability`)

**Creation Pattern:**
```typescript
import { createLogger } from '@lead-flood/observability';

const logger = createLogger({
  service: 'api-test',
  env: 'test',
  level: 'debug'
});
```

**Logger Interface:**
- Methods: `info(object, message)`, `warn(object, message)`, `error(object, message)`
- Object parameter: Record<string, unknown> - contextual data (not message string)
- Message parameter: string description
- Signature: `logger.info({ leadId: 'lead_1' }, 'Lead created successfully')`

**When to Log:**
- Significant state changes and async operation completion
- Integration points (job enqueueing, database writes)
- Error conditions (catch blocks)
- Not required for happy path in unit tests (see TESTING.md for test logging patterns)

## Comments

**When to Comment:**
- Complex business logic requiring explanation (e.g., multi-step algorithms)
- Non-obvious edge cases or workarounds
- TODO items for incomplete implementations
- Decision rationale for tricky type constraints or error handling

**JSDoc/TSDoc:**
- Not consistently used in codebase
- Infer from function signatures, types, and parameter names
- Minimal comments relied upon - code self-documents through clear naming

**Comment Style:**
- Single-line comments: `// Comment`
- Multi-line: `/* Comment */`
- TODO format: `// TODO: [what needs to be done]`

## Function Design

**Size:**
- Prefer small, focused functions under 50 lines
- Extract complex logic into separate functions with clear names
- Use factory/builder pattern (`buildX()`) for constructor-like functions with complex setup

**Parameters:**
- Function accepts 1-4 arguments typically
- More than 2-3 arguments: use object/interface parameter (e.g., `buildAuthenticateUser(deps: AuthenticateUserDependencies)`)
- Use dependency injection - pass dependencies as parameters, not globals
- Example: `buildAuthenticateUser({ findUserByEmail, createSession, accessTokenSecret, refreshTokenSecret })`

**Return Values:**
- Explicit return type annotations always
- Void when no value returned (not `undefined`)
- Nullable returns use `Type | null` (not `Type | undefined`)
- Promise-based for async operations: `Promise<Type>`
- Union types for multiple success outcomes (rare - prefer discriminated unions or exceptions)

## Module Design

**Exports:**
- Export all public functions and interfaces
- Marker: if something is `export`ed, it's part of the public contract
- Private functions: no `export` keyword
- Path-specific exports common (e.g., `export { buildAnalyticsService }` from service module)

**Barrel Files:**
- Not heavily used in this codebase
- Some packages export via `index.ts` (e.g., `packages/contracts/src/index.ts`)
- Feature modules typically import directly from service/repository files

**Example Module Structure:**
```
modules/auth/
├── auth.errors.ts      # Export: PasswordHashError, etc.
├── service.ts          # Export: buildAuthenticateUser
├── password.ts         # Export: hashPassword, verifyPassword
├── jwt.ts              # Export: signJwt, verifyJwt
└── service.test.ts     # Test suite
```

## Repository Pattern

**Used throughout:**
- Each domain has `[feature].repository.ts`
- Interface defines contract, stubs provided for testing, Prisma implementation for production
- Example from `apps/api/src/modules/icp/icp.repository.ts`:
  - Export: `interface IcpRepository { ... }`
  - Export: `class StubIcpRepository implements IcpRepository { ... }`
  - Export: `class PrismaIcpRepository extends StubIcpRepository { ... }`

**Dependency Injection:**
- Services receive repository as parameter, not direct database access
- Enables testing with stub repositories
- Service layer orchestrates business logic, repository handles persistence

## Error Classification (from CLAUDE.md)

**RetryableError:**
- Transient failures (network timeouts, rate limits, temporary unavailability)
- pg-boss automatically retries with exponential backoff
- Example: API rate limits, temporary database unavailability

**PermanentError:**
- Unrecoverable failures (invalid input, authentication, missing resources)
- Mark job as failed immediately, stop retrying
- Example: Invalid API credentials, user not found

**Unknown:**
- Unexpected errors without clear classification
- Conservative approach: retry first, escalate if patterns emerge
- Tracked for monitoring and future classification

---

*Convention analysis: 2026-02-17*
