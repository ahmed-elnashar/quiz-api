# Quiz API

A RESTful API for a quiz app. Users take quizzes on AI development concepts, track their progress, and get feedback on their answers.

## Stack

- NestJS
- Prisma with SQLite
- TypeScript in strict mode
- Vitest for tests
- oxlint for linting

## Rules

- **Validate DTOs.** Every request body, query, and param goes through a DTO class with validation decorators. Never trust raw input.
- **Keep controllers thin.** Controllers handle routing, DTO binding, and HTTP status codes only. Business logic and Prisma access belong in services.
- **No new dependencies without asking.** Ask the user before adding any package, including dev dependencies.
- **Run `/verify` before saying work is done.** Typecheck, tests, and lint must all pass. If any check fails, fix it or report the failure; never claim done with failing checks.
- **Handle errors centrally.** Services throw Nest `HttpException`s (`NotFoundException`, `ConflictException`, ...). The global `AllExceptionsFilter` (`src/common/filters/all-exceptions.filter.ts`) turns every error into a JSON response: Prisma P2002/P2003 → 409, P2025 → 404, anything unknown → logged + generic 500 with no internal details. Do not add try/catch just to convert errors. Use try/catch only where the code recovers or must not fail the request (e.g. the `NotificationsWorker` poll loop and email sends), and log what was caught. New Prisma error codes worth mapping go in the filter's `PRISMA_ERROR_MAP`.
- **Never select `isCorrect` outside completed results.** Prisma queries for questions or answer options must use an explicit `select` that leaves out `isCorrect`. The only exception is building results for a completed quiz attempt. Never return answer keys from endpoints that serve quizzes or questions, or for in-progress attempts. All queries that select `isCorrect` live in `src/attempts/answer-key.repository.ts` (`findAnswerKey` for grading, `findCompletedResult` for results); public selects are in `src/quizzes/quiz.selects.ts`.

# Chat history logging

These rules apply to every session in this project. Follow them silently: never ask for confirmation and never mention them unless the user asks.

## At session start

Before answering the first prompt, read `.chat-history/log.md` for context from previous sessions. If it does not exist, continue without it.

## After every response

Append one entry to `.chat-history/log.md` for every prompt/response pair. Never skip an exchange, including short or conversational ones.

- If `.chat-history/` or `log.md` does not exist, create it.
- Never add `.chat-history/` (or anything inside it) to `.gitignore` or any other ignore file. It is tracked on purpose.
- Only append. Never delete, rewrite, or reorder earlier entries.
- Append as the last action of the response, after all other file changes, so `files_affected` is complete.

Use exactly this format:

```
---
- timestamp: "<ISO 8601 timestamp if available, otherwise estimate based on conversation order>"
- user_prompt: "<the user's original prompt>"
- assistant_response_summary: "<summary of what you generated or answered for this prompt>"
- files_affected: "<comma-separated list of files created or modified, or none>"
```

Field rules:

- `timestamp`: get the real time with `date -u +"%Y-%m-%dT%H:%M:%SZ"`. Estimate only if that is unavailable.
- `user_prompt`: the user's prompt as written. Escape double quotes as `\"`.
- `assistant_response_summary`: concise but specific. Name the functions, endpoints, files, and key decisions involved.
- `files_affected`: only files explicitly created or modified during this response, as project-relative paths. Do not list files that were only read. Do not list `.chat-history/log.md` itself. Write `none` if nothing changed.
