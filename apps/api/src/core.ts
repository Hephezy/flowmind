import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
export type Actor = {
  id: string;
  workspaceId: string;
  role: "owner" | "admin" | "member";
  sessionId?: string;
  permissions?: string[];
};
@Injectable()
export class Db extends PrismaClient {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
export function parse<S extends z.ZodTypeAny>(s: S, b: unknown): z.output<S> {
  const r = s.safeParse(b);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}
export function admin(a: Actor) {
  if (a.role === "member")
    throw new ForbiddenException("Workspace admin permission required");
}
export function owner(a: Actor) {
  if (a.role !== "owner")
    throw new ForbiddenException("Workspace owner permission required");
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function equal(a: string, b: string) {
  return (
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function encrypt(s: string) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || "", "hex");
  if (key.length !== 32)
    throw new BadRequestException(
      "Server ENCRYPTION_KEY must contain 32 bytes",
    );
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  return [
    iv.toString("hex"),
    Buffer.concat([c.update(s, "utf8"), c.final()]).toString("hex"),
    c.getAuthTag().toString("hex"),
  ]
    .filter(Boolean)
    .join(".");
}
export function decrypt(s: string) {
  const [iv, data, tag] = s.split("."),
    c = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.ENCRYPTION_KEY!, "hex"),
      Buffer.from(iv, "hex"),
    );
  c.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    c.update(Buffer.from(data, "hex")),
    c.final(),
  ]).toString();
}
export function visibleMeetings(a: Actor) {
  return {
    workspaceId: a.workspaceId,
    OR: [{ isPrivate: false }, { uploadedBy: a.id }],
  };
}
export async function getMeeting(db: Db, a: Actor, id: string) {
  const m = await db.meeting.findFirst({
    where: { id, ...visibleMeetings(a) },
    include: { participants: true, transcript: true, summary: true },
  });
  if (!m) throw new NotFoundException("Meeting not found");
  return m;
}
export function assertMeetingWrite(a: Actor, m: { uploadedBy: string }) {
  if (a.role === "member" && m.uploadedBy !== a.id)
    throw new ForbiddenException(
      "Only the uploader or a workspace admin can modify this meeting",
    );
}
export const visibleActions = (a: Actor) => ({
  workspaceId: a.workspaceId,
  OR: [
    { meetingId: null },
    { meeting: { isPrivate: false } },
    { meeting: { uploadedBy: a.id } },
  ],
});
export async function audit(
  db: Db,
  a: Actor,
  event: string,
  details: Record<string, any> = {},
) {
  await db.auditLog.create({
    data: { workspaceId: a.workspaceId, actorId: a.id, event, details },
  });
}
export function publicIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  return (
    isIP(ip) === 6 && !/^(:|fc|fd|fe8|fe9|fea|feb|2001:db8|::ffff:)/i.test(ip)
  );
}
export async function safeUrl(input: string) {
  const u = new URL(input);
  const allowed = (process.env.EGRESS_ALLOWED_HOSTS || "")
    .split(",")
    .filter(Boolean);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    !allowed.includes(u.hostname)
  )
    throw new BadRequestException(
      "URL hostname must be explicitly allowed in EGRESS_ALLOWED_HOSTS",
    );
  const ips = await lookup(u.hostname, { all: true });
  if (!ips.length || ips.some((x) => !publicIp(x.address)))
    throw new BadRequestException(
      "Private network destinations are prohibited",
    );
  return u.toString();
}
export async function checkedFetch(url: string, options: RequestInit = {}) {
  const r = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Provider HTTP ${r.status}: ${body.slice(0, 250)}`);
  }
  return r;
}
