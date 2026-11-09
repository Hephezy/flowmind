import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { authenticator } from "otplib";
import { io } from "socket.io-client";
import { createServer } from "node:http";
const root = process.cwd();
const db = await PGlite.create();
await db.exec(
  await readFile(
    "apps/api/prisma/migrations/202610050001_initial/migration.sql",
    "utf8",
  ),
);
const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 55432 });
await server.start();
const temporary = await mkdtemp(tmpdir() + "/flowmind-e2e-");
const redis = spawn(
  process.env.REDIS_TEST_BINARY || "redis-server",
  [
    "--port",
    "56379",
    "--bind",
    "127.0.0.1",
    "--save",
    "",
    "--appendonly",
    "no",
  ],
  { stdio: "ignore" },
);
let api,
  output = "";
const mock = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const json = JSON.parse(body);
  const extracting = json.messages?.[0]?.content.includes("Extract actionable");
  const response = extracting
    ? {
        actions: [
          {
            title: "Write the QA report",
            description: "Publish test results",
            assigneeName: "Alpha Owner",
            dueDate: null,
            priority: "high",
            sourceQuote: "I will write the QA report",
            sourceTimestampSec: 0,
            confidence: 0.97,
          },
        ],
      }
    : {
        content: "The team agreed to publish the QA report.",
        keyDecisions: ["Publish the report"],
        topics: ["QA"],
        sentiment: "positive",
      };
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(response) } }],
    }),
  );
});
await new Promise((resolve) => mock.listen(54001, "127.0.0.1", resolve));
const base = "http://127.0.0.1:54000/api";
let checks = 0;
async function call(
  path,
  method = "GET",
  body,
  token,
  expected = 200,
  headers = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  checks++;
  return { data, response };
}
try {
  await new Promise((resolve) => setTimeout(resolve, 300));
  api = spawn(process.execPath, ["apps/api/dist/apps/api/src/main.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: "54000",
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1",
      REDIS_URL: "redis://127.0.0.1:56379",
      JWT_SECRET: "test-only-secret-with-at-least-32-characters",
      ENCRYPTION_KEY: "11".repeat(32),
      WEB_ORIGIN: "http://localhost:3000",
      API_PUBLIC_URL: "http://127.0.0.1:54000",
      LOCAL_STORAGE_PATH: temporary,
      QUEUE_BACKOFF_MS: "10",
      QUEUE_ATTEMPTS: "2",
      OPENAI_API_KEY: "integration-fixture-only",
      OPENAI_BASE_URL: "http://127.0.0.1:54001/v1",
      ANTHROPIC_API_KEY: "",
    },
  });
  api.stdout.on("data", (d) => (output += d));
  api.stderr.on("data", (d) => (output += d));
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + "/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "API startup failed: " + output);
  await call("/bootstrap", "GET", undefined, null, 401);
  const a = await call(
      "/auth/signup",
      "POST",
      {
        name: "Alpha Owner",
        email: "alpha@example.com",
        password: "SafePassword123!",
        workspace: "Alpha Workspace",
      },
      null,
      201,
    ),
    b = await call(
      "/auth/signup",
      "POST",
      {
        name: "Beta Member",
        email: "beta@example.com",
        password: "SafePassword123!",
        workspace: "Beta Workspace",
      },
      null,
      201,
    );
  const ta = a.data.accessToken;
  let tb = b.data.accessToken;
  const da = (await call("/bootstrap", "GET", undefined, ta)).data,
    dbeta = (await call("/bootstrap", "GET", undefined, tb)).data;
  const shared = (
      await call(
        "/meetings",
        "POST",
        {
          title: "Shared meeting",
          participants: ["Alpha Owner", "Beta Member"],
        },
        ta,
        201,
      )
    ).data,
    privateMeeting = (
      await call(
        "/meetings",
        "POST",
        { title: "Private strategy", isPrivate: true },
        ta,
        201,
      )
    ).data;
  await call("/meetings/" + shared.id, "GET", undefined, tb, 404);
  await call("/meetings/" + privateMeeting.id, "GET", undefined, tb, 404);
  const invitation = (
    await call(
      "/team/invites",
      "POST",
      { email: "beta@example.com", role: "member" },
      ta,
      201,
    )
  ).data;
  await call(
    "/team/accept",
    "POST",
    { token: invitation.inviteUrl.split("/").at(-1) },
    tb,
    201,
  );
  const switched = await call(
    "/workspaces/switch",
    "POST",
    { workspaceId: da.workspace.id },
    tb,
    201,
  );
  tb = switched.data.accessToken;
  await call("/meetings/" + shared.id, "GET", undefined, tb);
  await call("/meetings/" + privateMeeting.id, "GET", undefined, tb, 404);
  await call("/workspace", "PATCH", { name: "Hijacked" }, tb, 403);
  const own = (
    await call(
      "/actions",
      "POST",
      {
        title: "Beta follow-up",
        meetingId: shared.id,
        assignedTo: dbeta.user.id,
      },
      ta,
      201,
    )
  ).data;
  await call("/actions/" + own.id, "PATCH", { status: "done" }, tb);
  const other = (
    await call(
      "/actions",
      "POST",
      { title: "Owner-only action", assignedTo: da.user.id },
      ta,
      201,
    )
  ).data;
  await call("/actions/" + other.id, "PATCH", { status: "done" }, tb, 403);
  await call(
    "/actions",
    "POST",
    { title: "Leak", meetingId: privateMeeting.id },
    tb,
    404,
  );
  const foreign = (
    await call(
      "/actions",
      "POST",
      { title: "Beta personal workspace" },
      b.data.accessToken,
      201,
    )
  ).data;
  await call("/actions/" + foreign.id, "PATCH", { status: "done" }, ta, 404);
  await call("/team/members/" + dbeta.user.id, "PATCH", { role: "admin" }, ta);
  const key = (
    await call(
      "/keys",
      "POST",
      {
        name: "Limited read key",
        permissions: ["meetings:read", "actions:read"],
      },
      tb,
      201,
    )
  ).data;
  await call("/meetings/" + shared.id, "GET", undefined, key.value);
  await call(
    "/meetings/" + privateMeeting.id,
    "GET",
    undefined,
    key.value,
    404,
  );
  await call("/actions", "POST", { title: "Denied write" }, key.value, 403);
  const socket = io("http://127.0.0.1:54000", {
    auth: { token: tb },
    transports: ["websocket"],
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  let ack = await socket
    .timeout(3000)
    .emitWithAck("meeting:join", { meetingId: privateMeeting.id });
  assert.equal(ack.error, "Meeting not found");
  checks++;
  ack = await socket
    .timeout(3000)
    .emitWithAck("meeting:join", { meetingId: shared.id });
  assert.equal(ack.id, shared.id);
  checks++;
  socket.disconnect();
  const enrollment = (
    await call("/security/totp", "POST", { action: "setup" }, ta, 201)
  ).data;
  const enabled = (
    await call(
      "/security/totp",
      "POST",
      { action: "enable", code: authenticator.generate(enrollment.secret) },
      ta,
      201,
    )
  ).data;
  assert.equal(enabled.backupCodes.length, 8);
  await call("/security/totp", "POST", { action: "setup" }, ta, 400);
  await call(
    "/auth/login",
    "POST",
    {
      email: "alpha@example.com",
      password: "SafePassword123!",
      code: enabled.backupCodes[0],
    },
    undefined,
    201,
  );
  await call(
    "/auth/login",
    "POST",
    {
      email: "alpha@example.com",
      password: "SafePassword123!",
      code: enabled.backupCodes[0],
    },
    undefined,
    401,
  );
  await call(
    "/security/totp",
    "POST",
    { action: "disable", code: authenticator.generate(enrollment.secret) },
    ta,
    201,
  );
  const verification = "test-verification-token";
  await db.query(
    'INSERT INTO "AuthToken" (id,"userId",kind,"tokenHash","expiresAt") VALUES ($1,$2,$3,$4,NOW()+interval \'1 hour\')',
    [
      randomUUID(),
      da.user.id,
      "verify",
      createHash("sha256").update(verification).digest("hex"),
    ],
  );
  await call("/auth/verify", "POST", { token: verification }, undefined, 201);
  await call("/auth/verify", "POST", { token: verification }, undefined, 400);
  assert.equal(
    (await call("/bootstrap", "GET", undefined, ta)).data.settings
      .emailVerified,
    true,
  );
  const upload = (
    await call(
      "/meetings/" + shared.id + "/uploads",
      "POST",
      { filename: "test.wav", size: 4 },
      ta,
      201,
    )
  ).data;
  let r = await fetch(base + "/uploads/" + upload.id, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + ta,
      "Content-Type": "application/octet-stream",
      "Upload-Offset": "0",
    },
    body: Buffer.from("test"),
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).offset, 4);
  checks++;
  r = await fetch(base + "/uploads/" + upload.id, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + ta,
      "Content-Type": "application/octet-stream",
      "Upload-Offset": "0",
    },
    body: Buffer.from("test"),
  });
  assert.equal(r.status, 409);
  checks++;
  await call("/uploads/" + upload.id + "/complete", "POST", {}, ta, 201);
  await call("/meetings/" + shared.id + "/process", "POST", {}, ta, 201);
  let failed;
  for (let i = 0; i < 80; i++) {
    const result = (
      await call("/meetings/" + shared.id + "/status", "GET", undefined, ta)
    ).data;
    if (result.status === "failed") {
      failed = result;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(
    failed?.stage,
    "transcribe",
    "Transcription failure should leave the upload stage complete",
  );
  const complete = (
    await call(
      "/meetings",
      "POST",
      { title: "Fixture-backed AI pipeline" },
      ta,
      201,
    )
  ).data;
  await call(
    `/meetings/${complete.id}/transcript`,
    "POST",
    {
      segments: [
        {
          speaker: "Alpha Owner",
          text: "I will write the QA report",
          startSec: 0,
          endSec: 20,
        },
      ],
    },
    ta,
    201,
  );
  await call(`/meetings/${complete.id}/process`, "POST", {}, ta, 201);
  let done;
  for (let i = 0; i < 100; i++) {
    done = (await call(`/meetings/${complete.id}/status`, "GET", undefined, ta))
      .data;
    if (done.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(done.status, "completed");
  let snapshot = (await call("/bootstrap", "GET", undefined, ta)).data;
  const extracted = snapshot.actions.filter((a) => a.meetingId === complete.id);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].assignedTo, da.user.id);
  assert.equal(extracted[0].sourceTimestampSec, 0);
  assert.equal(
    snapshot.meetings.find((m) => m.id === complete.id).summary,
    "The team agreed to publish the QA report.",
  );
  await call(`/meetings/${complete.id}/reprocess`, "POST", {}, ta, 201);
  for (let i = 0; i < 100; i++) {
    done = (await call(`/meetings/${complete.id}/status`, "GET", undefined, ta))
      .data;
    if (done.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(done.status, "completed");
  snapshot = (await call("/bootstrap", "GET", undefined, ta)).data;
  assert.equal(
    snapshot.actions.filter((a) => a.meetingId === complete.id).length,
    1,
    "Reprocessing must not duplicate extracted actions",
  );
  await call("/resources/keys/" + key.id, "DELETE", undefined, ta);
  await call("/actions", "GET", undefined, key.value, 401);
  await call("/team/members/" + dbeta.user.id, "PATCH", { remove: true }, ta);
  await call("/meetings/" + shared.id, "GET", undefined, tb, 401);
  const resetToken = "test-password-reset";
  await db.query(
    'INSERT INTO "AuthToken" (id,"userId",kind,"tokenHash","expiresAt") VALUES ($1,$2,$3,$4,NOW()+interval \'1 hour\')',
    [
      randomUUID(),
      da.user.id,
      "reset",
      createHash("sha256").update(resetToken).digest("hex"),
    ],
  );
  await call(
    "/auth/reset",
    "POST",
    { token: resetToken, password: "short" },
    undefined,
    400,
  );
  await call(
    "/auth/reset",
    "POST",
    { token: resetToken, password: "ChangedSafePass123!" },
    undefined,
    201,
  );
  await call("/bootstrap", "GET", undefined, ta, 401);
  await call(
    "/auth/reset",
    "POST",
    { token: resetToken, password: "ChangedSafePass123!" },
    undefined,
    400,
  );
  const relogin = (
    await call(
      "/auth/login",
      "POST",
      { email: "alpha@example.com", password: "ChangedSafePass123!" },
      undefined,
      201,
    )
  ).data.accessToken;
  await call(
    "/workspace/delete",
    "POST",
    { confirmation: "wrong", password: "ChangedSafePass123!" },
    relogin,
    400,
  );
  await call(
    "/account/delete",
    "POST",
    { confirmation: "alpha@example.com", password: "ChangedSafePass123!" },
    relogin,
    201,
  );
  await call("/bootstrap", "GET", undefined, relogin, 401);
  console.log(
    `API integration checks passed: ${checks}. PostgreSQL-compatible engine + real Redis + running NestJS API. Tenant isolation, privacy, RBAC, scoped keys, upload chunks, stage failure, key/member revocation.`,
  );
} catch (e) {
  console.error(output.slice(-8000));
  throw e;
} finally {
  if (api) {
    api.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  redis.kill("SIGTERM");
  await new Promise((resolve) => mock.close(resolve));
  await server.stop();
  await db.close();
  await rm(temporary, { recursive: true, force: true });
}
