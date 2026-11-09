import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes, createHmac } from "node:crypto";
import { z } from "zod";
import {
  actionSchema,
  actionPatch,
  meetingSchema,
  segmentSchema,
} from "@flowmind/shared";
import {
  Db,
  Actor,
  parse,
  admin,
  owner,
  hash,
  encrypt,
  getMeeting,
  assertMeetingWrite,
  visibleMeetings,
  visibleActions,
  audit,
  safeUrl,
  checkedFetch,
  equal,
} from "./core";
import { StorageService } from "./storage";
import { compare } from "bcryptjs";
import { Notifications } from "./notifications";
import { DateTime } from "luxon";
export const serialMeeting = (m: any) => ({
  id: m.id,
  title: m.title,
  date: m.date,
  createdAt: m.createdAt,
  durationSeconds: m.durationSeconds,
  participants: m.participants.map((p: any) => p.displayName),
  status: m.status,
  isPrivate: m.isPrivate,
  context: m.context,
  stage: m.stage,
  progress: m.progress,
  error: m.error,
  segments: m.transcript?.segments || [],
  summary: m.summary?.content || "",
  keyDecisions: m.summary?.keyDecisions || [],
  topics: m.summary?.topics || [],
  sentiment: m.summary?.sentiment || "neutral",
  source: m.source,
  runVersion: m.runVersion,
  audioUrl: m.storageUrl ? `/api/meetings/${m.id}/audio` : undefined,
});
@Injectable()
export class AppService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Notifications) private notifications: Notifications,
    @Inject(StorageService) private storage: StorageService,
  ) {}
  async bootstrap(a: Actor) {
    const [
      u,
      w,
      members,
      meetings,
      actions,
      invites,
      integrations,
      webhooks,
      keys,
      logs,
      notifications,
    ] = await Promise.all([
      this.db.user.findUniqueOrThrow({ where: { id: a.id } }),
      this.db.workSpace.findUniqueOrThrow({ where: { id: a.workspaceId } }),
      this.db.workspaceMember.findMany({
        where: { workspaceId: a.workspaceId },
        include: { user: true },
      }),
      this.db.meeting.findMany({
        where: visibleMeetings(a),
        include: { transcript: true, summary: true, participants: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      this.db.actionItem.findMany({
        where: visibleActions(a),
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
      a.role === "member"
        ? []
        : this.db.invitation.findMany({
            where: { workspaceId: a.workspaceId },
            select: {
              id: true,
              email: true,
              role: true,
              createdAt: true,
              expiresAt: true,
            },
          }),
      this.db.integration.findMany({
        where: { workspaceId: a.workspaceId },
        select: { id: true, provider: true, settings: true, createdAt: true },
      }),
      a.role === "member"
        ? []
        : this.db.webhook.findMany({
            where: { workspaceId: a.workspaceId },
            select: {
              id: true,
              url: true,
              events: true,
              isActive: true,
              successCount: true,
              failureCount: true,
              lastTriggeredAt: true,
              deliveries: { take: 20, orderBy: { createdAt: "desc" } },
            },
          }),
      a.role === "member"
        ? []
        : this.db.apiKey.findMany({
            where: { workspaceId: a.workspaceId },
            select: {
              id: true,
              name: true,
              prefix: true,
              permissions: true,
              createdAt: true,
              lastUsedAt: true,
            },
          }),
      this.db.auditLog.findMany({
        where: {
          workspaceId: a.workspaceId,
          ...(a.role === "member" ? { actorId: a.id } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      this.db.notification.findMany({
        where: { userId: a.id, workspaceId: a.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return {
      user: {
        id: u.id,
        name: u.name,
        role: a.role,
        timezone: u.timezone,
        joinedAt: u.createdAt,
      },
      workspace: {
        id: w.id,
        name: w.name,
        slug: w.slug,
        description: w.description,
        plan: w.plan,
      },
      members: members.map((m) => ({
        id: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      meetings: meetings.map(serialMeeting),
      actions,
      invites,
      integrations,
      webhooks,
      keys,
      logs,
      notifications: (u.settings as any).inApp === false ? [] : notifications,
      settings: {
        email: true,
        inApp: true,
        meetingReady: true,
        actionAssigned: true,
        dueReminder: true,
        overdueDigest: true,
        weeklyDigest: true,
        slack: false,
        ...(u.settings as any),
        timezone: u.timezone,
        name: u.name,
        totpEnabled: u.totpEnabled,
        emailVerified: u.emailVerified,
        avatarUrl: u.avatarUrl,
        workspaceDefaults: {
          defaultLanguage: w.defaultLanguage,
          actionDueDays: w.actionDueDays,
          confidenceThreshold: w.confidenceThreshold,
          maxSpeakers: w.maxSpeakers,
        },
        workspaceSettings: w.settings,
        planLimits:
          JSON.parse(process.env.PLAN_LIMITS_JSON || "{}")[w.plan] || {},
      },
    };
  }
  async createMeeting(a: Actor, b: unknown) {
    await this.checkLimit(a, "meetings");
    const data = parse(meetingSchema, b),
      m = await this.db.meeting.create({
        data: {
          workspaceId: a.workspaceId,
          uploadedBy: a.id,
          ...data,
          date: data.date ? new Date(data.date) : new Date(),
          participants: {
            create: data.participants.map((name) => ({ displayName: name })),
          },
        },
        include: { participants: true },
      });
    await audit(this.db, a, "meeting.created", {
      meetingId: m.id,
      title: m.title,
    });
    return serialMeeting(m);
  }
  async meetings(a: Actor, q: any) {
    const where: any = visibleMeetings(a);
    if (q.search)
      where.AND = [
        {
          OR: [
            { title: { contains: String(q.search), mode: "insensitive" } },
            {
              transcript: {
                fullText: { contains: String(q.search), mode: "insensitive" },
              },
            },
          ],
        },
      ];
    if (["pending", "processing", "completed", "failed"].includes(q.status))
      where.status = q.status;
    return (
      await this.db.meeting.findMany({
        where,
        include: { participants: true, transcript: true, summary: true },
        orderBy: { createdAt: "desc" },
        take: Math.min(Number(q.limit) || 100, 500),
      })
    ).map(serialMeeting);
  }
  async transcript(a: Actor, id: string, b: unknown) {
    const m = await getMeeting(this.db, a, id);
    assertMeetingWrite(a, m);
    if (m.status === "processing")
      throw new BadRequestException("Cannot edit during processing");
    const seg = parse(z.array(segmentSchema).min(1).max(20000), b);
    await this.db.transcript.upsert({
      where: { meetingId: id },
      create: {
        meetingId: id,
        fullText: seg.map((s) => s.text).join("\n"),
        segments: seg,
        speakerCount: new Set(seg.map((s) => s.speaker)).size,
      },
      update: { fullText: seg.map((s) => s.text).join("\n"), segments: seg },
    });
    return { ok: true };
  }
  async updateMeeting(a: Actor, id: string, b: unknown) {
    const m = await getMeeting(this.db, a, id);
    assertMeetingWrite(a, m);
    const data = parse(meetingSchema.partial(), b);
    await this.db.meeting.update({
      where: { id },
      data: {
        ...data,
        participants: data.participants
          ? {
              deleteMany: {},
              create: data.participants.map((displayName) => ({ displayName })),
            }
          : undefined,
        date: data.date ? new Date(data.date) : undefined,
      },
    });
    return { ok: true };
  }
  async deleteMeeting(a: Actor, id: string) {
    const m = await getMeeting(this.db, a, id);
    assertMeetingWrite(a, m);
    await this.storage.removeRecording(m);
    await this.db.meeting.delete({ where: { id } });
    await audit(this.db, a, "meeting.deleted", { meetingId: id });
    return { ok: true };
  }
  async createAction(a: Actor, b: unknown) {
    const data = parse(actionSchema, b);
    if (data.meetingId) await getMeeting(this.db, a, data.meetingId);
    await this.assignee(a, data.assignedTo);
    const item = await this.db.actionItem.create({
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        workspaceId: a.workspaceId,
        createdBy: a.id,
        activity: [
          { text: "Created manually", date: new Date().toISOString() },
        ],
      },
    });
    await audit(this.db, a, "action.created", { actionId: item.id });
    if (item.assignedTo)
      await this.notifications.user(
        item.assignedTo,
        a.workspaceId,
        "A new action is assigned to you",
        item.title,
        `${item.id}-assigned`,
        "actionAssigned",
      );
    return item;
  }
  async assignee(a: Actor, id?: string | null) {
    if (
      id &&
      !(await this.db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: a.workspaceId, userId: id },
        },
      }))
    )
      throw new BadRequestException("Assignee is not a workspace member");
  }
  async updateAction(a: Actor, id: string, b: unknown) {
    const item = await this.db.actionItem.findFirst({
      where: { id, ...visibleActions(a) },
    });
    if (!item) throw new NotFoundException();
    if (
      a.role === "member" &&
      item.assignedTo !== a.id &&
      item.createdBy !== a.id
    )
      throw new ForbiddenException("Only your own action items can be edited");
    const data = parse(actionPatch, b);
    await this.assignee(a, data.assignedTo);
    if (data.meetingId) await getMeeting(this.db, a, data.meetingId);
    const result = await this.db.actionItem.update({
      where: { id },
      data: {
        ...data,
        dueDate:
          data.dueDate === undefined
            ? undefined
            : data.dueDate
              ? new Date(data.dueDate)
              : null,
        completedAt: data.status
          ? data.status === "done"
            ? new Date()
            : null
          : undefined,
        activity: [
          ...((item.activity as any[]) || []),
          {
            text: data.status
              ? `Status changed to ${data.status.replace("_", " ")}`
              : "Updated action item",
            date: new Date().toISOString(),
          },
        ],
      },
    });
    await audit(this.db, a, "action.updated", { actionId: id, changes: data });
    if (data.status === "done")
      await this.notifications.emit(a.workspaceId, "action.completed", { id });
    if (data.assignedTo && data.assignedTo !== item.assignedTo)
      await this.notifications.user(
        data.assignedTo,
        a.workspaceId,
        "A new action is assigned to you",
        result.title,
        `${result.id}-assigned-${data.assignedTo}-${Date.now()}`,
        "actionAssigned",
      );
    return result;
  }
  async deleteAction(a: Actor, id: string) {
    const item = await this.db.actionItem.findFirst({
      where: { id, ...visibleActions(a) },
    });
    if (!item) throw new NotFoundException();
    if (a.role === "member" && item.createdBy !== a.id)
      throw new ForbiddenException();
    await this.db.actionItem.delete({ where: { id } });
    return { ok: true };
  }
  async profile(a: Actor, b: any) {
    const data = parse(
      z.object({
        name: z.string().min(2).max(100).optional(),
        timezone: z.string().optional(),
        avatarUrl: z
          .string()
          .max(1500000)
          .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
          .optional(),
        settings: z.record(z.any()).optional(),
      }),
      b,
    );
    if (data.timezone)
      try {
        new Intl.DateTimeFormat("en", { timeZone: data.timezone });
      } catch {
        throw new BadRequestException("Invalid timezone");
      }
    const u = await this.db.user.findUniqueOrThrow({ where: { id: a.id } });
    await this.db.user.update({
      where: { id: a.id },
      data: {
        ...data,
        settings: data.settings
          ? { ...(u.settings as any), ...data.settings }
          : undefined,
      },
    });
    return { ok: true };
  }
  async workspace(a: Actor, b: any) {
    admin(a);
    const data = parse(
      z.object({
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(2000).optional(),
        defaultLanguage: z.string().max(12).optional(),
        actionDueDays: z.number().int().min(1).max(365).optional(),
        confidenceThreshold: z.number().min(0).max(1).optional(),
        maxSpeakers: z.number().int().min(1).max(50).optional(),
        settings: z.record(z.any()).optional(),
      }),
      b,
    );
    await this.db.workSpace.update({ where: { id: a.workspaceId }, data });
    await audit(this.db, a, "workspace.updated");
    return { ok: true };
  }
  async invite(a: Actor, b: any) {
    admin(a);
    const data = parse(
        z.object({
          email: z
            .string()
            .email()
            .transform((v) => v.toLowerCase()),
          role: z.enum(["admin", "member"]).default("member"),
          message: z.string().max(1000).default(""),
        }),
        b,
      ),
      token = randomBytes(32).toString("hex");
    const ws = await this.db.workSpace.findUniqueOrThrow({
      where: { id: a.workspaceId },
    });
    if (
      !(await this.db.invitation.findUnique({
        where: {
          workspaceId_email: { workspaceId: a.workspaceId, email: data.email },
        },
      }))
    )
      await this.checkLimit(a, "members");
    const i = await this.db.invitation.upsert({
      where: {
        workspaceId_email: { workspaceId: a.workspaceId, email: data.email },
      },
      create: {
        workspaceId: a.workspaceId,
        ...data,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
      update: {
        ...data,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    const url = `${process.env.WEB_ORIGIN?.split(",")[0]}/#invite/${token}`;
    if (process.env.RESEND_API_KEY)
      await checkedFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: data.email,
          subject: `Join ${ws.name} on FlowMind`,
          text: `${data.message}\n\nAccept invitation: ${url}\nExpires in 7 days.`,
        }),
      });
    await audit(this.db, a, "team.invited", { email: data.email });
    return {
      id: i.id,
      inviteUrl: url,
      emailSent: !!process.env.RESEND_API_KEY,
    };
  }
  async accept(a: Actor, token: string) {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: a.id } }),
      i = await this.db.invitation.findUnique({
        where: { tokenHash: hash(token) },
      });
    if (!i || i.expiresAt < new Date() || u.email !== i.email)
      throw new BadRequestException(
        "Invitation expired or belongs to another email",
      );
    await this.db.$transaction([
      this.db.workspaceMember.upsert({
        where: {
          workspaceId_userId: { workspaceId: i.workspaceId, userId: a.id },
        },
        create: { workspaceId: i.workspaceId, userId: a.id, role: i.role },
        update: {},
      }),
      this.db.invitation.delete({ where: { id: i.id } }),
    ]);
    return { workspaceId: i.workspaceId };
  }
  async member(a: Actor, id: string, b: any) {
    admin(a);
    const m = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: a.workspaceId, userId: id } },
    });
    if (!m || m.role === "owner" || a.id === id)
      throw new BadRequestException("Cannot change owner or your own role");
    if (b.remove) {
      await this.db.workspaceMember.delete({ where: { id: m.id } });
      await this.db.actionItem.updateMany({
        where: { workspaceId: a.workspaceId, assignedTo: id },
        data: { assignedTo: null },
      });
    } else
      await this.db.workspaceMember.update({
        where: { id: m.id },
        data: { role: parse(z.enum(["admin", "member"]), b.role) },
      });
    await audit(this.db, a, "team.member_updated", { userId: id });
    return { ok: true };
  }
  async key(a: Actor, b: any) {
    admin(a);
    const data = parse(
        z.object({
          name: z.string().min(1).max(100),
          permissions: z
            .array(
              z.enum([
                "meetings:read",
                "meetings:write",
                "actions:read",
                "actions:write",
                "webhooks:read",
                "webhooks:write",
              ]),
            )
            .min(1),
        }),
        b,
      ),
      value = "fm_" + randomBytes(32).toString("hex");
    const key = await this.db.apiKey.create({
      data: {
        workspaceId: a.workspaceId,
        createdBy: a.id,
        ...data,
        keyHash: hash(value),
        prefix: value.slice(0, 11),
      },
    });
    return { id: key.id, value };
  }
  async webhook(a: Actor, b: any) {
    admin(a);
    const data = parse(
      z.object({
        url: z.string().url(),
        events: z
          .array(z.enum(["meeting.completed", "action.completed"]))
          .min(1),
      }),
      b,
    );
    await safeUrl(data.url);
    const secret = randomBytes(32).toString("hex"),
      w = await this.db.webhook.create({
        data: {
          workspaceId: a.workspaceId,
          ...data,
          secretHash: hash(secret),
          secretEncrypted: encrypt(secret),
        },
      });
    return { id: w.id, secret };
  }
  async deleteResource(a: Actor, resource: string, id: string) {
    admin(a);
    if (resource === "keys")
      await this.db.apiKey.deleteMany({
        where: { id, workspaceId: a.workspaceId },
      });
    else if (resource === "webhooks")
      await this.db.webhook.deleteMany({
        where: { id, workspaceId: a.workspaceId },
      });
    else if (resource === "invites")
      await this.db.invitation.deleteMany({
        where: { id, workspaceId: a.workspaceId },
      });
    else if (resource === "integrations")
      await this.db.integration.deleteMany({
        where: { provider: id, workspaceId: a.workspaceId },
      });
    else throw new BadRequestException();
    await audit(this.db, a, resource + ".removed", { id });
    return { ok: true };
  }
  async sessions(a: Actor) {
    return this.db.session.findMany({
      where: { userId: a.id },
      select: { id: true, userAgent: true, createdAt: true, expiresAt: true },
    });
  }
  async checkout(a: Actor, b: any) {
    owner(a);
    const secret = process.env.STRIPE_SECRET_KEY,
      price =
        process.env[
          b.plan === "team" ? "STRIPE_TEAM_PRICE_ID" : "STRIPE_PRO_PRICE_ID"
        ];
    if (!secret || !price)
      throw new ServiceUnavailableException(
        "Billing provider is not configured",
      );
    const w = await this.db.workSpace.findUniqueOrThrow({
      where: { id: a.workspaceId },
    });
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: `${process.env.WEB_ORIGIN?.split(",")[0]}/#settings/billing`,
      cancel_url: `${process.env.WEB_ORIGIN?.split(",")[0]}/#settings/billing`,
      "metadata[workspaceId]": a.workspaceId,
      "metadata[plan]": b.plan === "team" ? "team" : "pro",
      ...(w.stripeCustomerId ? { customer: w.stripeCustomerId } : {}),
    });
    return checkedFetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }).then((r) => r.json());
  }
  async stripe(raw: Buffer, signature: string) {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw new ServiceUnavailableException("Stripe webhook is not configured");
    const timestamp = signature.match(/t=(\d+)/)?.[1],
      sigs = [...signature.matchAll(/v1=([a-f0-9]+)/g)].map((v) => v[1]);
    if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
      throw new BadRequestException("Invalid signature");
    const expected = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
      .update(timestamp + ".")
      .update(raw)
      .digest("hex");
    if (!sigs.some((s) => equal(s, expected)))
      throw new BadRequestException("Invalid signature");
    const e = JSON.parse(raw.toString()),
      o = e.data.object;
    if (e.type === "checkout.session.completed" && o.metadata.workspaceId) {
      await this.db.workSpace.update({
        where: { id: o.metadata.workspaceId },
        data: {
          stripeCustomerId: o.customer,
          stripeSubscriptionId: o.subscription,
          plan: o.metadata.plan === "team" ? "team" : "pro",
        },
      });
    }
    if (e.type === "customer.subscription.deleted")
      await this.db.workSpace.updateMany({
        where: { stripeCustomerId: o.customer },
        data: { plan: "starter", stripeSubscriptionId: null },
      });
    return { received: true };
  }
  async billingPortal(a: Actor) {
    owner(a);
    const w = await this.db.workSpace.findUniqueOrThrow({
      where: { id: a.workspaceId },
    });
    if (!w.stripeCustomerId || !process.env.STRIPE_SECRET_KEY)
      throw new BadRequestException("No billing account");
    return checkedFetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: w.stripeCustomerId,
        return_url: `${process.env.WEB_ORIGIN?.split(",")[0]}/#settings/billing`,
      }),
    }).then((r) => r.json());
  }
  async deleteWorkspace(a: Actor, b: any) {
    owner(a);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: a.id } }),
      workspace = await this.db.workSpace.findUniqueOrThrow({
        where: { id: a.workspaceId },
      });
    if (
      b.confirmation !== workspace.name ||
      !(await compare(String(b.password || ""), user.passwordHash))
    )
      throw new BadRequestException(
        "Confirm the workspace name and current password",
      );
    for (const m of await this.db.meeting.findMany({
      where: { workspaceId: a.workspaceId },
    }))
      await this.storage.removeRecording(m);
    await this.db.workSpace.delete({ where: { id: a.workspaceId } });
    await this.db.session.deleteMany({ where: { workspaceId: a.workspaceId } });
    return { ok: true };
  }
  async deleteAccount(a: Actor, b: any) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: a.id } });
    if (
      b.confirmation !== user.email ||
      !(await compare(String(b.password || ""), user.passwordHash))
    )
      throw new BadRequestException("Confirm your email and current password");
    for (const w of await this.db.workSpace.findMany({
      where: { ownerId: a.id },
    })) {
      for (const m of await this.db.meeting.findMany({
        where: { workspaceId: w.id },
      }))
        await this.storage.removeRecording(m);
      await this.db.workSpace.delete({ where: { id: w.id } });
    }
    for (const meeting of await this.db.meeting.findMany({
      where: { uploadedBy: a.id },
    }))
      await this.storage.removeRecording(meeting);
    await this.db.actionItem.updateMany({
      where: { assignedTo: a.id },
      data: { assignedTo: null },
    });
    await this.db.user.delete({ where: { id: a.id } });
    return { ok: true };
  }
  async invoices(a: Actor) {
    owner(a);
    const w = await this.db.workSpace.findUniqueOrThrow({
      where: { id: a.workspaceId },
    });
    if (!w.stripeCustomerId || !process.env.STRIPE_SECRET_KEY)
      return { data: [] };
    return checkedFetch(
      `https://api.stripe.com/v1/invoices?customer=${encodeURIComponent(w.stripeCustomerId)}&limit=24`,
      { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } },
    ).then((r) => r.json());
  }

  async checkLimit(a: Actor, resource: string) {
    let limits: any = {};
    try {
      limits = JSON.parse(process.env.PLAN_LIMITS_JSON || "{}");
    } catch {
      throw new ServiceUnavailableException("Server plan limits are invalid");
    }
    const w = await this.db.workSpace.findUniqueOrThrow({
        where: { id: a.workspaceId },
      }),
      limit = limits[w.plan]?.[resource];
    if (limit == null) return;
    let count = 0;
    if (resource === "meetings")
      count = await this.db.meeting.count({
        where: {
          workspaceId: a.workspaceId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      });
    if (resource === "members")
      count =
        (await this.db.workspaceMember.count({
          where: { workspaceId: a.workspaceId },
        })) +
        (await this.db.invitation.count({
          where: { workspaceId: a.workspaceId },
        }));
    if (count >= limit)
      throw new ForbiddenException(
        `Your ${w.plan} plan has reached its ${resource} limit`,
      );
  }
}
