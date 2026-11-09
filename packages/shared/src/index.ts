import { z } from "zod";
export const roles = ["owner", "admin", "member"] as const;
export const stages = [
  "upload",
  "transcribe",
  "speakers",
  "extract",
  "summarise",
  "notify",
] as const;
export type Role = (typeof roles)[number];
export type Stage = (typeof stages)[number];
export const actionStatus = z.enum(["todo", "in_progress", "done"]);
export const priority = z.enum(["low", "medium", "high"]);
export const email = z
  .string()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const signupSchema = z.object({
  name: z.string().min(2).max(100),
  email,
  password: z.string().min(12).max(128),
  workspace: z.string().min(2).max(100),
  timezone: z.string().default("Africa/Lagos"),
  referral:z.string().max(100).optional(),
});
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  code: z.string().optional(),
});
export const meetingSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.string().datetime().optional(),
  participants: z.array(z.string().min(1).max(100)).max(50).default([]),
  context: z.string().max(5000).default(""),
  isPrivate: z.boolean().default(false),
  language: z.string().max(12).default("en"),
});
export const actionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).default(""),
  meetingId: z.string().uuid().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  status: actionStatus.default("todo"),
  priority: priority.default("medium"),
  dueDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(10000).default(""),
});
export const actionPatch = actionSchema.partial();
export const segmentSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
});
export const extractionSchema = z.object({
  actions: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        description: z.string().default(""),
        assigneeName: z.string().nullable(),
        dueDate: z.string().nullable(),
        priority: priority,
        sourceQuote: z.string(),
        sourceTimestampSec: z.number().nonnegative(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(100),
});
export const summarySchema = z.object({
  content: z.string(),
  keyDecisions: z.array(z.string()),
  topics: z.array(z.string()),
  sentiment: z.enum(["positive", "neutral", "negative"]).default("neutral"),
});
export interface Segment {
  speaker: string;
  text: string;
  startSec: number;
  endSec: number;
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  timezone?: string;
}
export interface Meeting {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  durationSeconds: number;
  participants: string[];
  status: "pending" | "processing" | "completed" | "failed";
  isPrivate: boolean;
  context: string;
  stage: Stage;
  progress: number;
  error?: string | null;
  segments: Segment[];
  summary: string;
  keyDecisions: string[];
  topics: string[];
  source?: string;
  runVersion?: number;
  sentiment?: string;
  audioUrl?: string;
}
export interface Action {
  id: string;
  meetingId: string | null;
  title: string;
  description: string;
  assignedTo: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate: string | null;
  sourceQuote: string;
  sourceTimestampSec: number;
  confidence: number;
  notes: string;
  createdAt: string;
  activity: { text: string; date: string }[];
}
export interface Data {
  user: Member;
  workspace: {
    id: string;
    name: string;
    slug: string;
    description: string;
    plan: string;
  };
  members: Member[];
  meetings: Meeting[];
  actions: Action[];
  invites: any[];
  settings: Record<string, any>;
  integrations: any[];
  webhooks: any[];
  keys: any[];
  logs: any[];
  notifications: any[];
}
export function normaliseName(v: string) {
  return v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}
export function matchAssignee(
  name: string | null,
  members: { id: string; name: string }[],
): string | null {
  if (!name) return null;
  const n = normaliseName(name);
  const exact = members.filter((m) => normaliseName(m.name) === n);
  if (exact.length === 1) return exact[0].id;
  const candidates = members.filter((m) =>
    normaliseName(m.name).split(" ").includes(n),
  );
  return candidates.length === 1 ? candidates[0].id : null;
}
export function isOverdue(
  a: { status: string; dueDate: string | null },
  now = Date.now(),
) {
  return a.status !== "done" && !!a.dueDate && Date.parse(a.dueDate) < now;
}
