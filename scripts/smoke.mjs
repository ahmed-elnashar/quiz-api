#!/usr/bin/env node
// End-to-end smoke test for the Quiz API. Node built-ins only (fetch, child_process).
//
//   npm run smoke                    build, then run every check against a fresh app
//   EMAIL_FAIL=true npm run smoke    same, with the mock email service failing every send
//   SMOKE_BASE_URL=http://localhost:3000 node scripts/smoke.mjs
//                                    run against a server you started yourself; it needs a
//                                    seeded database and the same EMAIL_FAIL setting
//
// By default the script creates a temporary SQLite database, applies the migrations, runs
// the seed (dist/seed/run-seed.js), starts dist/main.js on a free port against it, and
// deletes it afterwards. That keeps runs isolated: another app instance polling dev.db
// (e.g. "npm run start:dev") cannot pick up this run's notifications.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMAIL_FAIL = process.env.EMAIL_FAIL === 'true';
const ANSWER_KEY_FIELDS = ['isCorrect', 'explanation', 'correctOptionId'];
const SEEDED_TITLES = ['Prompt Engineering Fundamentals', 'Retrieval-Augmented Generation (RAG)'];

let passed = 0;
let failed = 0;
let api = '';

// ---------------------------------------------------------------- helpers

function section(title) {
  console.log(`\n${title}`);
}

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail === undefined ? '' : `\n      got: ${JSON.stringify(detail)}`}`);
  }
  return condition;
}

/** Stops the run: later checks depend on this one. */
function mustPass(name, condition, detail) {
  if (!check(name, condition, detail)) {
    throw new Error(`Cannot continue: ${name}`);
  }
}

async function request(method, path, body) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json };
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every object key anywhere in a JSON value. */
function keysDeep(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      keysDeep(child, keys);
    }
  }
  return keys;
}

function leakedFields(value) {
  const keys = keysDeep(value);
  return ANSWER_KEY_FIELDS.filter((field) => keys.has(field));
}

function checkNoLeak(name, value) {
  const leaked = leakedFields(value);
  return check(`${name} exposes no answer key`, leaked.length === 0, leaked);
}

async function notificationFor(userId, attemptId) {
  const res = await get(`/users/${userId}/notifications?limit=100`);
  return res.body?.items?.find((n) => n.attemptId === attemptId);
}

async function waitForNotification(userId, attemptId, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await notificationFor(userId, attemptId);
    if (last && predicate(last)) return last;
    await sleep(500);
  }
  return last;
}

// ---------------------------------------------------------------- server

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function runStep(label, command, args, env) {
  const result = spawnSync(command, args, { cwd: ROOT, env, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${result.stdout}${result.stderr}`);
  }
}

/** Creates a migrated, seeded SQLite database in the temp dir. */
function prepareDatabase() {
  const file = join(tmpdir(), `quiz-api-smoke-${process.pid}-${Date.now()}.db`);
  const env = { ...process.env, DATABASE_URL: `file:${file}` };
  runStep('prisma migrate deploy', 'npx', ['--no-install', 'prisma', 'migrate', 'deploy'], env);
  runStep('seed', process.execPath, [join(ROOT, 'dist', 'seed', 'run-seed.js')], env);
  return {
    url: env.DATABASE_URL,
    remove: () => {
      for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(`${file}${suffix}`, { force: true });
    },
  };
}

async function startServer(databaseUrl) {
  const entry = join(ROOT, 'dist', 'main.js');
  if (!existsSync(entry)) {
    throw new Error('dist/main.js not found. Run "npm run build" (npm run smoke builds first).');
  }
  const port = await freePort();
  const child = spawn(process.execPath, [entry], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), EMAIL_FAIL: EMAIL_FAIL ? 'true' : 'false' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });

  const base = `http://127.0.0.1:${port}/api`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${stderr}`);
    try {
      if ((await fetch(`${base}/quizzes?limit=1`)).ok) return { base, stop };
    } catch {
      // not listening yet
    }
    await sleep(250);
  }
  await stop();
  throw new Error(`Server did not become ready in 20s:\n${stderr}`);
}

// ---------------------------------------------------------------- checks

/** A quiz the script owns, so it knows the correct answers without the API revealing them. */
function smokeQuizBody(authorId, runId) {
  const questions = [
    ['Which model output is easiest to parse in code?', 'Structured JSON', ['Free-form prose', 'A poem']],
    ['What does an eval measure?', 'Model quality on a task', ['API latency only', 'Token price']],
    ['What does a vector database store?', 'Embeddings', ['Model weights', 'GPU drivers']],
    ['What is a token?', 'A chunk of text the model reads', ['An API key', 'A GPU core']],
    ['What limits how much text a model can read at once?', 'The context window', ['The temperature', 'The seed']],
  ];
  return {
    authorId,
    title: `Smoke quiz ${runId}`,
    description: 'Created by scripts/smoke.mjs',
    topic: 'smoke',
    questions: questions.map(([text, right, wrongs], i) => ({
      text,
      explanation: `Explanation ${i + 1}: the answer is "${right}".`,
      options: [...wrongs.map((w) => ({ text: w, isCorrect: false })), { text: right, isCorrect: true }],
    })),
  };
}

/** Builds answers from the public quiz view, using the answers the script itself wrote. */
function answersFor(publicQuiz, sentBody, correctCount) {
  return publicQuiz.questions.map((question, i) => {
    const sent = sentBody.questions.find((q) => q.text === question.text);
    const wanted = sent.options.find((o) => o.isCorrect === (i < correctCount)).text;
    return { questionId: question.id, optionId: question.options.find((o) => o.text === wanted).id };
  });
}

async function run() {
  const runId = Date.now().toString(36);

  section('Quiz management');
  const list = await get('/quizzes?limit=100');
  mustPass('GET /quizzes returns 200', list.status === 200, list.status);
  const seeded = list.body.items.filter((q) => SEEDED_TITLES.includes(q.title));
  mustPass(
    'at least 2 quizzes with 5+ questions are preloaded (run "npm run db:seed" if this fails)',
    seeded.length >= 2 && seeded.every((q) => q.questionCount >= 5),
    seeded.map((q) => [q.title, q.questionCount]),
  );
  checkNoLeak('quiz list', list.body);

  for (const quiz of seeded) {
    const detail = await get(`/quizzes/${quiz.id}`);
    check(
      `GET /quizzes/:id "${quiz.title}" returns questions and options`,
      detail.status === 200 && detail.body.questions.length >= 5 && detail.body.questions.every((q) => q.options.length >= 2),
    );
    checkNoLeak(`quiz "${quiz.title}"`, detail.body);
  }

  const author = await post('/users', { email: `smoke-author-${runId}@example.com`, name: 'Smoke Author' });
  mustPass('POST /users creates the quiz author', author.status === 201, author);

  const quizBody = smokeQuizBody(author.body.id, runId);
  const twoCorrect = structuredClone(quizBody);
  twoCorrect.questions[0].options.forEach((o) => (o.isCorrect = true));
  check('POST /quizzes rejects a question with two correct options (400)', (await post('/quizzes', twoCorrect)).status === 400);
  const noExplanation = structuredClone(quizBody);
  delete noExplanation.questions[0].explanation;
  check('POST /quizzes rejects a question without an explanation (400)', (await post('/quizzes', noExplanation)).status === 400);

  const created = await post('/quizzes', quizBody);
  mustPass('POST /quizzes creates a quiz with 5 questions (201)', created.status === 201 && created.body.questions.length === 5, created);
  checkNoLeak('created quiz response', created.body);
  const fetched = await get(`/quizzes/${created.body.id}`);
  check('GET /quizzes/:id returns the created quiz', fetched.status === 200 && fetched.body.title === quizBody.title);
  checkNoLeak('created quiz', fetched.body);

  section('Users');
  const email = `smoke-${runId}@example.com`;
  const user = await post('/users', { email, name: 'Smoke Tester' });
  mustPass('POST /users creates a user with a contact email (201)', user.status === 201 && user.body.email === email, user);
  check('POST /users rejects a duplicate email (409)', (await post('/users', { email, name: 'Dup' })).status === 409);
  const userId = user.body.id;
  const fetchedUser = await get(`/users/${userId}`);
  check('GET /users/:id returns the stored user', fetchedUser.status === 200 && fetchedUser.body.email === email);

  section('Quiz attempt & submission');
  const started = await post(`/users/${userId}/attempts`, { quizId: created.body.id });
  mustPass('POST /users/:id/attempts starts an attempt (201)', started.status === 201 && started.body.status === 'IN_PROGRESS', started);
  check('started attempt returns 5 questions', started.body.questions.length === 5);
  checkNoLeak('started attempt', started.body);
  const firstAttemptId = started.body.id;

  const inProgress = await get(`/users/${userId}/attempts/${firstAttemptId}`);
  check('GET attempt detail works while in progress', inProgress.status === 200 && inProgress.body.status === 'IN_PROGRESS');
  checkNoLeak('in-progress attempt detail', inProgress.body);
  const earlyResult = await get(`/users/${userId}/attempts/${firstAttemptId}/result`);
  check('results are not available before submitting (409)', earlyResult.status === 409, earlyResult.status);
  checkNoLeak('early result response', earlyResult.body);

  const seededDetail = await get(`/quizzes/${seeded[0].id}`);
  const foreign = [{ questionId: seededDetail.body.questions[0].id, optionId: seededDetail.body.questions[0].options[0].id }];
  check('submit rejects answers from another quiz (400)', (await post(`/users/${userId}/attempts/${firstAttemptId}/submit`, { answers: foreign })).status === 400);

  const submitted = await post(`/users/${userId}/attempts/${firstAttemptId}/submit`, {
    answers: answersFor(started.body, quizBody, 4),
  });
  mustPass('submit succeeds (201)', submitted.status === 201, submitted);
  const result = submitted.body;
  check('4/5 correct scores 80%', result.correct === 4 && result.total === 5 && result.percentage === 80, [result.correct, result.total, result.percentage]);
  check('performance message matches the score', result.message === 'You scored 80%. Great job!', result.message);
  check(
    'per-question breakdown has correctness and explanations',
    result.questions.length === 5 &&
      result.questions.every((q) => typeof q.isCorrect === 'boolean' && typeof q.explanation === 'string' && q.correctOptionId),
  );
  check('the wrong answer is marked wrong with the correct option shown', result.questions.filter((q) => !q.isCorrect).length === 1);
  check('resubmitting returns 409', (await post(`/users/${userId}/attempts/${firstAttemptId}/submit`, { answers: [] })).status === 409);

  section(`Async email notification (EMAIL_FAIL=${EMAIL_FAIL})`);
  await sleep(3_000);
  const first = await notificationFor(userId, firstAttemptId);
  mustPass('a notification was recorded for the submission', first !== undefined);
  if (EMAIL_FAIL) {
    check('after 3s: still PENDING with a failed try recorded', first.status === 'PENDING' && first.attempts >= 1, first);
    check('lastError is stored', typeof first.lastError === 'string' && first.lastError.length > 0, first.lastError);
    check('sentAt is empty', first.sentAt === null, first.sentAt);
  } else {
    check('after 3s: status is SENT', first.status === 'SENT', first.status);
    check('sentAt is set and attempts is 1', first.sentAt !== null && first.attempts === 1, [first.sentAt, first.attempts]);
  }
  const payload = first.payload;
  check(
    "email payload has the user's name and email",
    payload.userName === 'Smoke Tester' && payload.userEmail === email,
    [payload.userName, payload.userEmail],
  );
  check('email payload has the quiz title', payload.quizTitle === quizBody.title, payload.quizTitle);
  check(
    'email payload has score, percentage and message',
    payload.score?.correct === 4 && payload.score?.total === 5 && payload.percentage === 80 && payload.message === result.message,
    payload,
  );
  check('email payload has the completion timestamp', payload.completedAt === result.completedAt, [payload.completedAt, result.completedAt]);

  section('Retake & user progress');
  const retake = await post(`/users/${userId}/attempts`, { quizId: created.body.id });
  mustPass('retaking starts a new attempt', retake.status === 201 && retake.body.id !== firstAttemptId, retake);
  const retakeResult = await post(`/users/${userId}/attempts/${retake.body.id}/submit`, {
    answers: answersFor(retake.body, quizBody, 5),
  });
  check(
    'retake 5/5 scores 100% with its own message',
    retakeResult.status === 201 && retakeResult.body.percentage === 100 && retakeResult.body.message === 'You scored 100%. Perfect score!',
    retakeResult.body,
  );

  const history = await get(`/users/${userId}/attempts`);
  check('history has 2 attempts', history.status === 200 && history.body.total === 2, history.body?.total);
  checkNoLeak('attempt history', history.body);
  const firstInHistory = history.body.items.find((a) => a.id === firstAttemptId);
  check('the first attempt is kept after the retake (still 80%)', firstInHistory?.percentage === 80, firstInHistory);

  const detail = await get(`/users/${userId}/attempts/${firstAttemptId}`);
  check('single attempt detail returns the completed attempt', detail.status === 200 && detail.body.status === 'COMPLETED' && detail.body.percentage === 80);
  const storedResult = await get(`/users/${userId}/attempts/${firstAttemptId}/result`);
  check(
    'detailed results of the first attempt are still retrievable',
    storedResult.status === 200 && storedResult.body.percentage === 80 && storedResult.body.questions.length === 5,
  );

  const stats = await get(`/users/${userId}/progress`);
  check(
    'stats: 2 attempts, average 90%, best 100%',
    stats.status === 200 &&
      stats.body.totalAttempts === 2 &&
      stats.body.completedAttempts === 2 &&
      stats.body.averagePercentage === 90 &&
      stats.body.bestPercentage === 100,
    stats.body,
  );

  section('Notification status tracking');
  if (EMAIL_FAIL) {
    const failedNotification = await waitForNotification(userId, firstAttemptId, (n) => n.status === 'FAILED', 20_000);
    check(
      'first notification is FAILED after 3 tries',
      failedNotification?.status === 'FAILED' && failedNotification.attempts === 3,
      failedNotification && [failedNotification.status, failedNotification.attempts],
    );
    const stillThere = await get(`/users/${userId}/attempts/${firstAttemptId}/result`);
    check('the submission is unaffected by the failed email', stillThere.status === 200 && stillThere.body.percentage === 80);
  } else {
    const retakeNotification = await waitForNotification(userId, retake.body.id, (n) => n.status === 'SENT', 10_000);
    check('retake notification is SENT', retakeNotification?.status === 'SENT', retakeNotification?.status);
  }
}

// ---------------------------------------------------------------- main

const cleanup = [];
try {
  if (process.env.SMOKE_BASE_URL) {
    api = `${process.env.SMOKE_BASE_URL.replace(/\/$/, '')}/api`;
    console.log(`Using running server at ${api} (it must run with EMAIL_FAIL=${EMAIL_FAIL})`);
  } else {
    const database = prepareDatabase();
    cleanup.unshift(database.remove);
    const server = await startServer(database.url);
    cleanup.unshift(server.stop);
    api = server.base;
    console.log(`Started app at ${api} with EMAIL_FAIL=${EMAIL_FAIL} on a fresh, seeded database`);
  }
  await run();
} catch (error) {
  failed += 1;
  console.log(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const step of cleanup) await step();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
