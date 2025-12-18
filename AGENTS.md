- Never use `npm` only `pnpm`
- See package.json for commands
- Write unit tests for features (using vitest)
- Commit often.
- Always use zod v3 to validate

Use a clean, layered structure: Separates concerns into controllers → services → repositories/data access.

### Key Best Practices

- **Separation of Concerns (SoC) & SOLID Principles**
  - Controllers: Thin — only handle HTTP, validation, call services.
  - Services: Contain business logic, orchestrate repositories.
  - Repositories: Abstract data access (use interfaces for testability).
  - Keep domain logic framework-agnostic.
- **Type Safety**
  - Define interfaces/types for everything (requests, responses, entities).
  - Use DTOs with validation libraries (zod, yup, class-validator).
  - Avoid any; enable strict mode in tsconfig.json.

**Configuration & Environment**

- Use dotenv + validation (zod schema for env vars).
- Centralize config in src/config/.
- Never commit secrets.

**Error Handling**

- Create custom error classes extending Error.
- Use a global error middleware.
- Return consistent error responses (e.g., { error: { message, code, details } }).

**Testing Structure**

- Mirror src/ in tests/.
- Unit test services/repositories.
- Integration test routes/controllers.
