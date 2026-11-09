import { Inject } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import { Db, getMeeting } from "./core";
import { Queues } from "./queue";
import { createAdapter } from "@socket.io/redis-adapter";
@WebSocketGateway({
  cors: {
    origin: (process.env.WEB_ORIGIN || "http://localhost:3000").split(","),
    credentials: true,
  },
  maxHttpBufferSize: 10000,
})
export class ProcessingGateway {
  @WebSocketServer() server!: Server;
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
    @Inject(Queues) private queues: Queues,
  ) {}
  private pub: any;
  private sub: any;
  afterInit(server: Server) {
    this.pub = this.queues.connection.duplicate();
    this.sub = this.queues.connection.duplicate();
    server.adapter(createAdapter(this.pub, this.sub));
    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch(() => next(new Error("Sign in required")));
    });
  }
  async onModuleDestroy() {
    await this.pub?.quit();
    await this.sub?.quit();
  }
  async authenticate(socket: Socket) {
    try {
      const p = this.jwt.verify(socket.handshake.auth.token);
      const [m, s] = await Promise.all([
        this.db.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: p.wid, userId: p.sub } },
        }),
        this.db.session.findFirst({
          where: { id: p.sid, userId: p.sub, expiresAt: { gt: new Date() } },
        }),
      ]);
      if (!m || !s) throw new Error();
      socket.data.actor = { id: p.sub, workspaceId: p.wid, role: m.role };
      socket.data.sessionId = p.sid;
      socket.data.expiresAt = p.exp * 1000;
      socket.data.timer = setTimeout(
        () => socket.disconnect(true),
        Math.max(0, p.exp * 1000 - Date.now()),
      );
    } catch {
      throw new Error("Invalid socket session");
    }
  }
  handleDisconnect(socket: Socket) {
    clearTimeout(socket.data.timer);
  }
  @SubscribeMessage("meeting:join") async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { meetingId: string },
  ) {
    if (!socket.data.actor) return;
    try {
      if (
        !(await this.db.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: socket.data.actor.workspaceId,
              userId: socket.data.actor.id,
            },
          },
        }))
      )
        throw new Error();
      const m = await getMeeting(this.db, socket.data.actor, body.meetingId);
      await socket.join(`${m.workspaceId}:${m.id}`);
      return {
        id: m.id,
        status: m.status,
        stage: m.stage,
        progress: m.progress,
      };
    } catch {
      return { error: "Meeting not found" };
    }
  }
  async emit(workspaceId: string, meetingId: string, event: any) {
    if (!this.server) return;
    const sockets = await this.server
      .in(`${workspaceId}:${meetingId}`)
      .fetchSockets();
    for (const socket of sockets) {
      const actor = socket.data.actor;
      if (!actor) continue;
      try {
        const [membership, session] = await Promise.all([
          this.db.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: actor.id } },
          }),
          this.db.session.findFirst({
            where: {
              id: socket.data.sessionId,
              userId: actor.id,
              expiresAt: { gt: new Date() },
            },
          }),
        ]);
        if (!membership || !session) throw new Error();
        await getMeeting(this.db, actor, meetingId);
        socket.emit("meeting:event", { meetingId, ...event });
      } catch {
        await socket.leave(`${workspaceId}:${meetingId}`);
      }
    }
  }
}
