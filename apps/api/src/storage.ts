import {
  BadRequestException,
  Inject,
  Injectable,
  ConflictException,
} from "@nestjs/common";
import { mkdir, stat, open, rename, rm, readdir } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { Request } from "express";
import {
  Db,
  Actor,
  getMeeting,
  assertMeetingWrite,
  checkedFetch,
} from "./core";
export const dataRoot = resolve(process.env.LOCAL_STORAGE_PATH || "data");
export const run = (cmd: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    p.stderr.on("data", (d) => (error = (error + d).slice(-2000)));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} failed: ${error}`)),
    );
  });
@Injectable()
export class StorageService {
  constructor(@Inject(Db) private db: Db) {}
  async initiate(a: Actor, meetingId: string, b: any) {
    const m = await getMeeting(this.db, a, meetingId);
    assertMeetingWrite(a, m);
    if (m.status !== "pending")
      throw new BadRequestException("Meeting already submitted");
    const size = Number(b.size);
    const workspace = await this.db.workSpace.findUniqueOrThrow({
        where: { id: a.workspaceId },
      }),
      limits =
        JSON.parse(process.env.PLAN_LIMITS_JSON || "{}")[workspace.plan] || {};
    if (limits.storageBytes != null) {
      const total = await this.db.upload.aggregate({
        where: { meeting: { workspaceId: a.workspaceId } },
        _sum: { size: true },
      });
      if (Number(total._sum.size || 0) + size > limits.storageBytes)
        throw new BadRequestException("Workspace storage limit reached");
    }

    if (
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 2 * 1024 ** 3 ||
      !/^.+\.(mp3|mp4|m4a|wav|webm)$/i.test(b.filename || "")
    )
      throw new BadRequestException("Supported audio/video up to 2GB required");
    await mkdir(join(dataRoot, "uploads"), { recursive: true });
    const u = await this.db.upload.create({
      data: {
        meetingId,
        filename: b.filename.slice(0, 200),
        size: BigInt(size),
      },
    });
    await open(join(dataRoot, "uploads", u.id), "w").then((f) => f.close());
    return { id: u.id, offset: 0, chunkSize: 5 * 1024 ** 2 };
  }
  async upload(a: Actor, id: string) {
    const u = await this.db.upload.findUnique({ where: { id } });
    if (!u) throw new BadRequestException("Upload not found");
    const m = await getMeeting(this.db, a, u.meetingId);
    assertMeetingWrite(a, m);
    return u;
  }
  async chunk(a: Actor, id: string, req: Request) {
    const u = await this.upload(a, id);
    if (u.completed) throw new ConflictException("Upload is complete");
    const offset = Number(req.headers["upload-offset"]),
      length = Number(req.headers["content-length"]);
    if (offset !== Number(u.offset))
      throw new ConflictException({
        message: "Resume from server offset",
        offset: Number(u.offset),
      });
    if (!length || length > 5 * 1024 ** 2 || offset + length > Number(u.size))
      throw new BadRequestException("Invalid chunk length");
    const path = join(dataRoot, "uploads", id),
      lock = path + ".lock";
    let handle;
    try {
      handle = await open(lock, "wx");
    } catch {
      throw new ConflictException("Another chunk is being written");
    }
    const temporary = path + "." + randomUUID();
    try {
      let received = 0;
      await pipeline(
        req,
        new Transform({
          transform(chunk, _e, cb) {
            received += chunk.length;
            cb(received > length ? new Error("Chunk too large") : null, chunk);
          },
        }),
        createWriteStream(temporary, { flags: "wx" }),
      );
      if (received !== length)
        throw new BadRequestException("Incomplete chunk");
      const fresh = await this.db.upload.findUniqueOrThrow({ where: { id } });
      if (fresh.offset !== u.offset)
        throw new ConflictException("Offset changed");
      const existing = await stat(path);
      if (existing.size !== offset) {
        const f = await open(path, "r+");
        await f.truncate(offset);
        await f.close();
      }
      await pipeline(
        createReadStream(temporary),
        createWriteStream(path, { flags: "a" }),
      );
      await this.db.upload.update({
        where: { id },
        data: { offset: BigInt(offset + received) },
      });
      return { offset: offset + received };
    } finally {
      await handle.close();
      await rm(lock, { force: true });
      await rm(temporary, { force: true });
    }
  }
  async complete(a: Actor, id: string) {
    const u = await this.upload(a, id);
    if (u.completed) return { meetingId: u.meetingId };
    if (u.offset !== u.size)
      throw new BadRequestException("Upload is incomplete");
    const destination = join(dataRoot, "recordings", u.meetingId + ".media");
    await mkdir(join(dataRoot, "recordings"), { recursive: true });
    await rename(join(dataRoot, "uploads", id), destination);
    let storageUrl = `local:${u.meetingId}.media`;
    if (process.env.STORAGE_URL && process.env.STORAGE_KEY) {
      const key = `${a.workspaceId}/${u.meetingId}.media`;
      await checkedFetch(
        `${process.env.STORAGE_URL}/storage/v1/object/${process.env.STORAGE_BUCKET}/${key}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.STORAGE_KEY}`,
            "Content-Type": "application/octet-stream",
            "x-upsert": "true",
          },
          body: createReadStream(destination) as any,
          duplex: "half",
        } as any,
      );
      storageUrl = `supabase:${key}`;
    }
    await this.db.$transaction([
      this.db.meeting.update({
        where: { id: u.meetingId },
        data: { storageUrl },
      }),
      this.db.upload.update({ where: { id }, data: { completed: true } }),
    ]);
    return { meetingId: u.meetingId };
  }
  async localFile(m: { id: string; storageUrl: string | null }) {
    const p = join(dataRoot, "recordings", m.id + ".media");
    try {
      await stat(p);
      return p;
    } catch {}
    if (!m.storageUrl?.startsWith("supabase:"))
      throw new Error("Recording is unavailable");
    await mkdir(join(dataRoot, "recordings"), { recursive: true });
    const r = await checkedFetch(
      `${process.env.STORAGE_URL}/storage/v1/object/authenticated/${process.env.STORAGE_BUCKET}/${m.storageUrl.slice(9)}`,
      { headers: { Authorization: `Bearer ${process.env.STORAGE_KEY}` } },
    );
    const { Readable } = await import("node:stream");
    await pipeline(Readable.fromWeb(r.body as any), createWriteStream(p));
    return p;
  }
  async cleanAbandoned() {
    const old = await this.db.upload.findMany({
      where: {
        completed: false,
        createdAt: { lt: new Date(Date.now() - 86400000) },
      },
    });
    for (const u of old) {
      await rm(join(dataRoot, "uploads", u.id), { force: true });
      await this.db.upload.delete({ where: { id: u.id } });
    }
  }
  async removeRecording(m: { id: string; storageUrl: string | null }) {
    if (m.storageUrl?.startsWith("supabase:"))
      await checkedFetch(
        `${process.env.STORAGE_URL}/storage/v1/object/${process.env.STORAGE_BUCKET}/${m.storageUrl.slice(9)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${process.env.STORAGE_KEY}` },
        },
      );
    await rm(join(dataRoot, "recordings", m.id + ".media"), { force: true });
    const uploads = await this.db.upload.findMany({
      where: { meetingId: m.id },
    });
    for (const u of uploads)
      await rm(join(dataRoot, "uploads", u.id), { force: true });
  }
}
