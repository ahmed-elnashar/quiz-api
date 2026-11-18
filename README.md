# Quiz API

A REST API for a quiz app about AI development concepts. Users take quizzes, submit answers, get a score with per-question feedback, and track their progress over time. After each submission, the user gets a result email. The email is sent in the background, so a failed send never fails the submission.

## Features

- **Quizzes**: create quizzes (each question has exactly one correct option and an explanation), list them with topic filter and paging, and fetch one quiz.
- **Attempts**: start an attempt to get the questions without answers, then submit once. Submitting grades the answers and returns the score, percentage, a performance message, and per-question correctness with explanations.
- **Progress**: attempt history (filter by status or quiz), single attempt detail, the result of a completed attempt, and stats (total, completed, in progress, average and best percentage).
- **Notifications**: a background worker emails each result, retries with backoff, and records the status (`PENDING`, `SENT` or `FAILED`), the number of tries, the last error, and the send time.
- **The answer key never leaks**: `isCorrect`, `explanation` and `correctOptionId` appear only in results of completed attempts.
- **Seed data**: 2 users and 2 quizzes with 5 questions each (Prompt Engineering Fundamentals, Retrieval-Augmented Generation).

## Tech stack

| Area        | Tool                                                |
| ----------- | --------------------------------------------------- |
| Framework   | NestJS 12 (Express)                                 |
| Language    | TypeScript (strict mode)                            |
| Database    | SQLite through Prisma 7 (`better-sqlite3` adapter)  |
| Validation  | `class-validator` / `class-transformer`             |
| Tests       | Vitest (unit and e2e)                               |
| Lint        | oxlint                                              |

## Getting started

### Prerequisites

- Node.js 22 or later (the app uses the built-in `process.loadEnvFile`)
- npm

### Install and run

```bash
# 1. Install dependencies (this also generates the Prisma client)
npm install

# 2. Create your environment file
cp .env.example .env

# 3. Create the SQLite database and apply the migrations
npm run db:migrate

# 4. Load the sample users and quizzes (safe to run again)
npm run db:seed

# 5. Start the API in watch mode
npm run start:dev
```

The API listens on `http://localhost:3000/api`. Check it with:

```bash
curl http://localhost:3000/api/quizzes
```

For a production-style run, build first and then start the compiled app:

```bash
npm run build
npm start
```

### Environment variables

| Variable                       | Default         | Description                                                        |
| ------------------------------ | --------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`                 | `file:./dev.db` | SQLite database file.                                              |
| `PORT`                         | `3000`          | HTTP port.                                                         |
| `EMAIL_FAIL`                   | `false`         | Set to `true` to make the mock email service fail every send.      |
| `NOTIFICATIONS_WORKER_ENABLED` | `true`          | Set to `false` to stop the background worker from sending emails.  |
| `NOTIFICATIONS_POLL_MS`        | `2000`          | How often the worker looks for emails to send, in milliseconds.    |

Email is mocked: `MockEmailService` logs the recipient and subject instead of sending anything.

## Scripts

| Command                            | What it does                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run start:dev`                | Start the API in watch mode.                                                          |
| `npm run build` / `npm start`      | Compile to `dist/` / run the compiled app.                                            |
| `npm run db:migrate`               | Apply migrations to the database in `DATABASE_URL` (`prisma migrate dev`).            |
| `npm run db:seed`                  | Build, then create the sample users and quizzes. Skips data that already exists.      |
| `npm test`                         | Run all unit and e2e tests (Vitest). E2e tests use their own `test.db`.               |
| `npm run typecheck`                | Type-check without emitting files.                                                    |
| `npm run lint`                     | Lint with oxlint.                                                                     |
| `npm run smoke`                    | Build, then test every API feature end to end against a temporary database.          |
| `EMAIL_FAIL=true npm run smoke`    | Same, with every email failing, to check retries and the `FAILED` status.             |

To run the smoke checks against a server that is already running (with a seeded database):

```bash
SMOKE_BASE_URL=http://localhost:3000 node scripts/smoke.mjs
```

Note: every running app instance polls its database for emails to send. If you run `npm run start:dev` on `dev.db`, that instance sends the emails for `dev.db`.

## API

All routes start with `/api`. Request bodies, query strings and route params are validated; unknown fields are rejected with `400`.

| Method | Path                                              | Description                                                    |
| ------ | ------------------------------------------------- | -------------------------------------------------------------- |
| POST   | `/users`                                          | Create a user (`email`, `name`). `409` if the email is taken.  |
| GET    | `/users/:userId`                                  | Get a user.                                                    |
| POST   | `/quizzes`                                        | Create a quiz with its questions and options.                  |
| GET    | `/quizzes?topic=&page=&limit=`                    | List quizzes.                                                  |
| GET    | `/quizzes/:id`                                    | Get a quiz with its questions (no answers).                    |
| POST   | `/users/:userId/attempts`                         | Start an attempt (`quizId`). Returns the questions.            |
| POST   | `/users/:userId/attempts/:attemptId/submit`       | Submit answers and get the result.                             |
| GET    | `/users/:userId/attempts?status=&quizId=&page=&limit=` | Attempt history.                                          |
| GET    | `/users/:userId/attempts/:attemptId`              | One attempt. Shows questions while it is in progress.          |
| GET    | `/users/:userId/attempts/:attemptId/result`       | Result of a completed attempt. `409` if not submitted yet.     |
| GET    | `/users/:userId/progress`                         | Stats: totals, average and best percentage.                    |
| GET    | `/users/:userId/notifications`                    | Email notifications and their delivery status.                 |

### Example: take a quiz

This example uses `curl` and `jq`.

```bash
# Create a user and pick the first quiz
USER_ID=$(curl -s -X POST localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"grace@example.com","name":"Grace Hopper"}' | jq -r .id)
QUIZ_ID=$(curl -s localhost:3000/api/quizzes | jq -r '.items[0].id')

# Start an attempt: returns the questions and option ids, without answers
curl -s -X POST localhost:3000/api/users/$USER_ID/attempts \
  -H 'Content-Type: application/json' -d "{\"quizId\":\"$QUIZ_ID\"}"

# Submit: one entry per answered question; questions left out count as wrong
curl -s -X POST localhost:3000/api/users/$USER_ID/attempts/<attemptId>/submit \
  -H 'Content-Type: application/json' \
  -d '{"answers":[{"questionId":"<questionId>","optionId":"<optionId>"}]}'
```

The submit response contains `correct`, `total`, `percentage`, a `message` such as `"You scored 80%. Great job!"`, and a `questions` array with `selectedOptionId`, `correctOptionId`, `isCorrect` and `explanation` for each question.

### Errors

Every error is returned as JSON by one global filter:

| Status | When                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | Invalid input, or answers for questions or options that are not in the quiz.     |
| `404`  | The user, quiz or attempt does not exist (or the attempt belongs to someone else). |
| `409`  | Duplicate email, submitting an attempt twice, or asking for a result too early.   |
| `500`  | Unexpected error. Details are logged, never returned.                             |

## Architecture

### Project layout

```
src/
├── main.ts                    Bootstrap: load .env, create the app, listen
├── app.module.ts              Root module, registers the global exception filter
├── app.setup.ts               Shared setup: /api prefix, ValidationPipe, shutdown hooks
├── common/                    Constants, pagination DTO, input transforms, AllExceptionsFilter
├── prisma/                    PrismaService (database client) and module
├── users/                     Users endpoints and service
├── quizzes/                   Quiz endpoints, service, DTOs, public (answer-free) selects
├── attempts/                  Start and submit attempts; AnswerKeyRepository
├── scoring/                   Pure scoring functions and the performance message
├── progress/                  History, attempt detail, results, stats
├── notifications/             Email service (mock), background worker, notifications endpoint
├── seed/                      Seed data and runner
└── generated/prisma/          Generated Prisma client (not committed)
prisma/
├── schema.prisma              Data model
└── migrations/                SQL migrations
scripts/smoke.mjs              End-to-end smoke test (Node built-ins only)
test/                          E2e tests and fixtures
```

### Layers

Each feature is a NestJS module with the same layers:

```
HTTP request
   │
   ▼
ValidationPipe ── DTO classes validate and transform every body, query and param
   │
   ▼
Controller ────── routing, DTO binding, HTTP status codes only
   │
   ▼
Service ───────── business logic; throws Nest HttpExceptions (NotFound, Conflict, ...)
   │
   ▼
PrismaService ─── SQLite
   │
   ▼
AllExceptionsFilter ── turns any error into JSON:
                       Prisma P2002/P2003 → 409, P2025 → 404, unknown → logged + 500
```

### Data model

```
User ─┬─< Quiz ──< Question ──< Option
      │     │          │          │
      ├─< Attempt ──< AttemptAnswer
      │     │
      └─< Notification (one per completed attempt)
```

- `Option.isCorrect` and `Question.explanation` hold the answer key.
- `Attempt` has a status (`IN_PROGRESS` or `COMPLETED`) and, once submitted, `score`, `totalQuestions`, `percentage` and `completedAt`.
- `AttemptAnswer` stores the chosen option and whether it was correct.
- `Notification` stores the email payload as JSON, plus `status`, `attempts`, `lastError`, `nextAttemptAt` and `sentAt`.

### Keeping the answer key private

All public queries use explicit Prisma `select`s from `src/quizzes/quiz.selects.ts` that leave out `isCorrect` and `explanation`. The only queries that read the answer key are in `src/attempts/answer-key.repository.ts`:

- `findAnswerKey` loads it to grade a submission.
- `findCompletedResult` builds the result of a completed attempt.

The e2e tests and the smoke script scan every response sent before submission for answer-key fields.

### Submitting an attempt

`AttemptsService.submit`:

1. Checks the attempt exists, belongs to the user, and is still `IN_PROGRESS` (otherwise `404` or `409`).
2. Checks every answer refers to a question and option of this quiz (otherwise `400`).
3. Grades the answers with `calculateScore` and builds the message with `getPerformanceMessage` (pure functions in `src/scoring/`).
4. In **one database transaction**: marks the attempt `COMPLETED` (only if it is still `IN_PROGRESS`, so two submits at the same time cannot both succeed), saves the answers, and creates a `PENDING` notification.
5. Returns the result.

The submit never sends email itself, so an email failure cannot affect it.

### Email notifications

`NotificationsWorker` runs inside the app and polls every `NOTIFICATIONS_POLL_MS` (2 s by default):

1. Finds `PENDING` notifications that are due.
2. Claims each one with a single conditional update: it adds one to `attempts` and moves `nextAttemptAt` 30 s ahead as a lease. If another app instance claimed it first, the update matches no row and the notification is skipped.
3. Sends the email. On success it sets `SENT` and `sentAt`. On failure it saves `lastError` and schedules a retry after 2 s, then 4 s.
4. After 3 failed tries the notification is marked `FAILED`.

The email contains the user's name and email, the quiz title, the score, the percentage, the performance message and the completion time.

## Testing

```bash
npm test             # unit + e2e tests
npm run typecheck
npm run lint
npm run smoke        # full end-to-end run against a real server
```

- **Unit tests**: scoring and performance messages (`src/scoring/scoring.spec.ts`), the worker's retry and backoff logic, and the exception filter.
- **E2e tests** (`test/`): every endpoint against a real SQLite database (`test.db`, recreated on each run). They include checks that a failing email never breaks a submission and that the answer key never leaks.
- **Smoke test** (`scripts/smoke.mjs`): builds and starts the real app on a temporary, seeded database and checks every feature over HTTP, including email delivery (`SENT`) or, with `EMAIL_FAIL=true`, retries ending in `FAILED`.
