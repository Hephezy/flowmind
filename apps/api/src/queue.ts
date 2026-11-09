import { Injectable } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
export const QUEUES = [
  "upload.process",
  "audio.transcribe",
  "actions.extract",
  "notify.send",
  "reminder.schedule",
] as const;
@Injectable()
export class Queues {
  connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
  queues = new Map<string, Queue>();
  workers: Worker[] = [];
  constructor() {
    for (const name of QUEUES)
      this.queues.set(
        name,
        new Queue(name, {
          connection: this.connection as any,
          defaultJobOptions: {
            attempts: Number(process.env.QUEUE_ATTEMPTS || 4),
            backoff: {
              type: "exponential",
              delay: Number(process.env.QUEUE_BACKOFF_MS || 5000),
            },
            removeOnComplete: { age: 86400 },
            removeOnFail: { age: 604800 },
          },
        }),
      );
  }
  add(queue: string, name: string, data: any, id?: string, delay?: number) {
    return this.queues.get(queue)!.add(name, data, {
      ...(id ? { jobId: id } : {}),
      ...(delay ? { delay } : {}),
    });
  }
  worker(queue: string, fn: (job: any) => Promise<any>, concurrency = 2) {
    const worker = new Worker(queue, fn, {
      connection: this.connection as any,
      concurrency,
    });
    worker.on("error", (e) => console.error("Worker error", queue, e.message));
    this.workers.push(worker);
    return worker;
  }
  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit();
  }
}
