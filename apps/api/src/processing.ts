import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Segment, matchAssignee } from "@flowmind/shared";
import { Db, Actor, getMeeting, assertMeetingWrite, hash, audit } from "./core";
import { Queues } from "./queue";
import { Llm } from "./llm";
import { StorageService } from "./storage";
import { ProcessingGateway } from "./gateway";
import { Notifications } from "./notifications";
import { Integrations } from "./integrations";
const mapping: Record<string, string> = {
  upload: "upload.process",
  transcribe: "audio.transcribe",
  speakers: "audio.transcribe",
  extract: "actions.extract",
  summarise: "actions.extract",
  notify: "notify.send",
};
const steps = [
  "upload",
  "transcribe",
  "speakers",
  "extract",
  "summarise",
  "notify",
];
@Injectable()
export class Processing {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Queues) private queues: Queues,
    @Inject(Llm) private llm: Llm,
    @Inject(StorageService) private storage: StorageService,
    @Inject(ProcessingGateway) private gateway: ProcessingGateway,
    @Inject(Notifications) private notifications: Notifications,
    @Inject(Integrations) private integrations: Integrations,
  ) {}
  async onModuleInit() {
    for (const queue of [
      "upload.process",
      "audio.transcribe",
      "actions.extract",
      "notify.send",
    ]) {
      const worker = this.queues.worker(queue, async (job) =>
        job.name === "pipeline"
          ? this.process(job)
          : this.notifications.send(job),
      );
      worker.on("failed", async (job, error) => {
        if (
          job?.name === "pipeline" &&
          job.attemptsMade >= Number(job.opts.attempts || 4)
        ) {
          const d = job.data;
          await this.db.meeting.updateMany({
            where: {
              id: d.meetingId,
              runVersion: d.runVersion,
              cancelled: false,
            },
            data: { status: "failed", error: error.message.slice(0, 500) },
          });
          this.gateway.emit(d.workspaceId, d.meetingId, {
            status: "failed",
            stage: d.stage,
            error: error.message.slice(0, 500),
          });
        }
      });
    }
    this.queues.worker(
      "reminder.schedule",
      async () => {
        await this.notifications.reminders();
        await this.storage.cleanAbandoned();
        await this.integrations.autoImports((actor, id) =>
          this.start(actor, id),
        );
      },
      1,
    );
    await this.queues.queues
      .get("reminder.schedule")!
      .upsertJobScheduler(
        "due-reminders",
        { every: 60000 },
        { name: "tick", data: {} },
      );
  }
  async enqueue(m: any, stage: string) {
    await this.queues.add(
      mapping[stage],
      "pipeline",
      {
        meetingId: m.id,
        workspaceId: m.workspaceId,
        runVersion: m.runVersion,
        stage,
      },
      `pipeline-${m.id}-${m.runVersion}-${stage}`,
    );
  }
  async start(a: Actor, id: string, reprocess = false) {
    const m = await getMeeting(this.db, a, id);
    assertMeetingWrite(a, m);
    if (!m.storageUrl && !m.transcript)
      throw new BadRequestException(
        "Upload a recording or add a transcript first",
      );
    if (m.status === "processing")
      throw new BadRequestException("Already processing");
    if (m.status === "completed" && !reprocess)
      throw new BadRequestException("Already processed");
    const next = await this.db.meeting.update({
      where: { id },
      data: {
        status: "processing",
        cancelled: false,
        error: null,
        progress: 0,
        runVersion: { increment: 1 },
        stage: reprocess && m.transcript ? "extract" : "upload",
      },
    });
    await this.enqueue(next, next.stage);
    return { id, status: next.status };
  }
  async cancel(a: Actor, id: string) {
    const m = await getMeeting(this.db, a, id);
    assertMeetingWrite(a, m);
    await this.db.meeting.update({
      where: { id },
      data: { cancelled: true, status: "failed", error: "Cancelled by user" },
    });
    this.gateway.emit(a.workspaceId, id, {
      status: "failed",
      error: "Cancelled by user",
    });
    return { ok: true };
  }
  async retry(a: Actor, id: string) {
    const m = await getMeeting(this.db, a, id);
    assertMeetingWrite(a, m);
    if (m.status !== "failed")
      throw new BadRequestException("Only failed meetings can retry");
    const jobId = `pipeline-${id}-${m.runVersion}-${m.stage}`,
      queue = this.queues.queues.get(mapping[m.stage])!;
    const job = await queue.getJob(jobId);
    await this.db.meeting.update({
      where: { id },
      data: { status: "processing", cancelled: false, error: null },
    });
    if (job && (await job.getState()) === "failed") await job.retry();
    else
      await this.enqueue(
        await this.db.meeting.update({
          where: { id },
          data: { runVersion: { increment: 1 } },
        }),
        m.stage,
      );
    return { ok: true };
  }
  async current(id: string, version: number) {
    return this.db.meeting.findFirst({
      where: {
        id,
        runVersion: version,
        cancelled: false,
        status: "processing",
      },
      include: {
        transcript: true,
        workspace: { include: { members: { include: { user: true } } } },
        participants: true,
      },
    });
  }
  async process(job: any) {
    const d = job.data;
    let m = await this.current(d.meetingId, d.runVersion);
    if (!m) return;
    const stage = d.stage;
    await this.db.meeting.updateMany({
      where: { id: m.id, runVersion: d.runVersion, cancelled: false },
      data: { stage, progress: 0 },
    });
    this.gateway.emit(m.workspaceId, m.id, {
      stage,
      status: "processing",
      progress: 0,
    });
    if (stage === "upload") {
      if (m.storageUrl) await this.storage.localFile(m);
    }
    if (stage === "transcribe" && !m.transcript) {
      const path = await this.storage.localFile(m),
        segments = await this.llm.transcribe(
          path,
          m.id,
          m.language,
          async (segments, progress) => {
            if (!(await this.current(m!.id, d.runVersion))) return;
            await this.db.meeting.updateMany({
              where: { id: m!.id, runVersion: d.runVersion, cancelled: false },
              data: { progress },
            });
            this.gateway.emit(m!.workspaceId, m!.id, {
              stage,
              progress,
              segments,
            });
          },
        );
      if (!(await this.current(m.id, d.runVersion))) return;
      await this.db.transcript.upsert({
        where: { meetingId: m.id },
        create: {
          meetingId: m.id,
          fullText: segments.map((s) => s.text).join("\n"),
          segments: segments as any,
          speakerCount: new Set(segments.map((s) => s.speaker)).size,
        },
        update: {},
      });
      await this.db.meeting.update({
        where: { id: m.id },
        data: { durationSeconds: Math.ceil(segments.at(-1)?.endSec || 0) },
      });
    }
    if (stage === "speakers") {
      const seg = (m.transcript?.segments || []) as unknown as Segment[];
      const names = [...new Set(seg.map((s) => s.speaker))];
      if (names.length > m.workspace.maxSpeakers)
        throw new Error(
          "Speaker count exceeds the workspace limit. Increase max speakers or review the transcript.",
        );
      for (const name of names) {
        const time = Math.round(
          seg
            .filter((s) => s.speaker === name)
            .reduce((n, s) => n + s.endSec - s.startSec, 0),
        );
        const participant = await this.db.participant.findFirst({
          where: { meetingId: m.id, displayName: name },
        });
        if (participant)
          await this.db.participant.update({
            where: { id: participant.id },
            data: { talkTimeSeconds: time },
          });
        else
          await this.db.participant.create({
            data: { meetingId: m.id, displayName: name, talkTimeSeconds: time },
          });
      }
    }
    if (stage === "extract") {
      if (!m.transcript) throw new Error("Transcript is unavailable");
      const seg = m.transcript.segments as unknown as Segment[],
        result = await this.llm.extract(seg, m.date, m.context);
      if (!(await this.current(m.id, d.runVersion))) return;
      const members = m.workspace.members.map((v) => ({
        id: v.userId,
        name: v.user.name,
      }));
      for (const a of result) {
        if (a.confidence < m.workspace.confidenceThreshold) continue;
        const source = seg.find(
          (s) =>
            Math.abs(s.startSec - a.sourceTimestampSec) <= 5 &&
            s.text.includes(a.sourceQuote),
        );
        if (!source || !a.sourceQuote.trim()) continue;
        const key = hash(
          m.id + "|" + a.sourceQuote + "|" + a.title.toLowerCase(),
        );
        let due = a.dueDate
          ? new Date(a.dueDate)
          : new Date(m.date.getTime() + m.workspace.actionDueDays * 86400000);
        if (Number.isNaN(due.getTime()))
          due = new Date(
            m.date.getTime() + m.workspace.actionDueDays * 86400000,
          );
        await this.db.actionItem.upsert({
          where: { extractionKey: key },
          create: {
            workspaceId: m.workspaceId,
            meetingId: m.id,
            createdBy: m.uploadedBy,
            title: a.title,
            description: a.description,
            assignedTo: matchAssignee(a.assigneeName, members),
            dueDate: due,
            priority: a.priority,
            sourceQuote: a.sourceQuote,
            sourceTimestampSec: source.startSec,
            confidence: a.confidence,
            extractionKey: key,
            activity: [
              {
                text: "Extracted from meeting",
                date: new Date().toISOString(),
              },
            ],
          },
          update: {},
        });
      }
    }
    if (stage === "summarise") {
      if (!m.transcript) throw new Error("Transcript unavailable");
      const summary = await this.llm.summarise(
        m.transcript.segments as unknown as Segment[],
        m.context,
      );
      if (!(await this.current(m.id, d.runVersion))) return;
      await this.db.summary.upsert({
        where: { meetingId: m.id },
        create: { meetingId: m.id, ...summary },
        update: summary,
      });
    }
    if (stage === "notify") {
      await this.notifications.user(
        m.uploadedBy,
        m.workspaceId,
        "Your meeting is ready",
        `${m.title} has been transcribed and its actions are ready.\n\n${(await this.db.summary.findUnique({ where: { meetingId: m.id } }))?.content || ""}`,
        `${m.id}-${m.runVersion}-ready`,
        "meetingReady",
      );
      await this.notifications.emit(m.workspaceId, "meeting.completed", {
        id: m.id,
        title: m.title,
        runVersion: m.runVersion,
      });
      await audit(
        this.db,
        { id: m.uploadedBy, workspaceId: m.workspaceId, role: "member" },
        "meeting.completed",
        { meetingId: m.id },
      );
      await this.db.meeting.updateMany({
        where: { id: m.id, runVersion: d.runVersion, cancelled: false },
        data: { status: "completed", processedAt: new Date(), progress: 100 },
      });
      this.gateway.emit(m.workspaceId, m.id, {
        stage,
        progress: 100,
        status: "completed",
      });
      return;
    }
    m = await this.current(m.id, d.runVersion);
    if (!m) return;
    const next = steps[steps.indexOf(stage) + 1];
    await this.db.meeting.updateMany({
      where: { id: m.id, runVersion: d.runVersion, cancelled: false },
      data: { progress: 100 },
    });
    this.gateway.emit(m.workspaceId, m.id, { stage, progress: 100 });
    await this.enqueue(m, next);
  }
}
