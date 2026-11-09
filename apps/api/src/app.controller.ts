import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  Inject,
  BadRequestException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { JwtService } from "@nestjs/jwt";
import { AuthService, AccessGuard } from "./auth";
import { AppService, serialMeeting } from "./app.service";
import { Processing } from "./processing";
import { StorageService } from "./storage";
import { Integrations } from "./integrations";
import { Db, Actor, getMeeting } from "./core";
type AuthRequest = Request & { user: Actor; rawBody?: Buffer };
@Controller("api/auth")
export class AuthController {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  @Post("forgot") forgot(@Body() b: any) {
    return this.auth.forgot(b);
  }
  @Post("reset") reset(@Body() b: any) {
    return this.auth.token(b, "reset");
  }
  @Post("verify") verify(@Body() b: any) {
    return this.auth.token(b, "verify");
  }
  @Post("signup") signup(
    @Body() b: any,
    @Req() r: Request,
    @Res({ passthrough: true }) s: Response,
  ) {
    return this.auth.signup(b, r, s);
  }
  @Post("login") login(
    @Body() b: any,
    @Req() r: Request,
    @Res({ passthrough: true }) s: Response,
  ) {
    return this.auth.login(b, r, s);
  }
  @Post("refresh") refresh(
    @Req() r: Request,
    @Res({ passthrough: true }) s: Response,
  ) {
    return this.auth.refresh(r, s);
  }
  @Post("logout") logout(
    @Req() r: Request,
    @Res({ passthrough: true }) s: Response,
  ) {
    return this.auth.logout(r, s);
  }
}
@Controller("api")
@UseGuards(AccessGuard)
export class AppController {
  constructor(
    @Inject(AppService) private app: AppService,
    @Inject(Processing) private processing: Processing,
    @Inject(StorageService) private storage: StorageService,
    @Inject(Integrations) private integrations: Integrations,
    @Inject(AuthService) private auth: AuthService,
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
  ) {}
  @Get("bootstrap") bootstrap(@Req() r: AuthRequest) {
    return this.app.bootstrap(r.user);
  }
  @Get("workspaces") workspaces(@Req() r: AuthRequest) {
    return this.db.workspaceMember.findMany({
      where: { userId: r.user.id },
      select: { role: true, workspace: { select: { id: true, name: true } } },
    });
  }
  @Post("workspaces/switch") async switchWorkspace(
    @Req() r: AuthRequest,
    @Body() b: any,
  ) {
    const m = await this.db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: b.workspaceId, userId: r.user.id },
      },
    });
    if (!m) throw new BadRequestException("Workspace access denied");
    await this.db.session.update({
      where: { id: r.user.sessionId },
      data: { workspaceId: m.workspaceId },
    });
    return {
      accessToken: this.jwt.sign(
        { sub: r.user.id, wid: m.workspaceId, sid: r.user.sessionId },
        { expiresIn: "15m" },
      ),
    };
  }
  @Get("meetings") meetings(@Req() r: AuthRequest, @Query() q: any) {
    return this.app.meetings(r.user, q);
  }
  @Post("meetings") createMeeting(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.createMeeting(r.user, b);
  }
  @Get("meetings/:id") async meeting(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return serialMeeting(await getMeeting(this.db, r.user, id));
  }
  @Get("meetings/:id/status") async status(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    const m = await getMeeting(this.db, r.user, id);
    return {
      id,
      status: m.status,
      stage: m.stage,
      progress: m.progress,
      error: m.error,
    };
  }
  @Get("meetings/:id/audio") async audio(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const m = await getMeeting(this.db, r.user, id);
    res.sendFile(await this.storage.localFile(m));
  }
  @Patch("meetings/:id") patchMeeting(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return this.app.updateMeeting(r.user, id, b);
  }
  @Delete("meetings/:id") deleteMeeting(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.app.deleteMeeting(r.user, id);
  }
  @Post("meetings/:id/transcript") transcript(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return this.app.transcript(r.user, id, b.segments);
  }
  @Post("meetings/:id/uploads") upload(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return this.storage.initiate(r.user, id, b);
  }
  @Get("uploads/:id") async uploadStatus(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    const u = await this.storage.upload(r.user, id);
    return { id: u.id, offset: Number(u.offset), size: Number(u.size) };
  }
  @Patch("uploads/:id") chunk(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.storage.chunk(r.user, id, r);
  }
  @Post("uploads/:id/complete") complete(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.storage.complete(r.user, id);
  }
  @Post("meetings/:id/process") process(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.processing.start(r.user, id);
  }
  @Post("meetings/:id/reprocess") reprocess(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.processing.start(r.user, id, true);
  }
  @Post("meetings/:id/retry") retry(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.processing.retry(r.user, id);
  }
  @Post("meetings/:id/cancel") cancel(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.processing.cancel(r.user, id);
  }
  @Get("actions") actions(@Req() r: AuthRequest) {
    return this.app.bootstrap(r.user).then((d) => d.actions);
  }
  @Post("actions") createAction(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.createAction(r.user, b);
  }
  @Patch("actions/:id") patchAction(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return this.app.updateAction(r.user, id, b);
  }
  @Delete("actions/:id") deleteAction(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.app.deleteAction(r.user, id);
  }
  @Patch("profile") profile(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.profile(r.user, b);
  }
  @Patch("workspace") workspace(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.workspace(r.user, b);
  }
  @Post("team/invites") invite(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.invite(r.user, b);
  }
  @Post("team/accept") accept(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.accept(r.user, b.token);
  }
  @Patch("team/members/:id") member(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return this.app.member(r.user, id, b);
  }
  @Post("security/verify-email") verifyEmail(@Req() r: AuthRequest) {
    return this.auth.issue(r.user.id, "verify");
  }
  @Post("account/delete") deleteAccount(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.deleteAccount(r.user, b);
  }
  @Post("workspace/delete") deleteWorkspace(
    @Req() r: AuthRequest,
    @Body() b: any,
  ) {
    return this.app.deleteWorkspace(r.user, b);
  }
  @Get("billing/invoices") invoices(@Req() r: AuthRequest) {
    return this.app.invoices(r.user);
  }
  @Post("security/password") password(@Req() r: AuthRequest, @Body() b: any) {
    return this.auth.password(r.user, b);
  }
  @Post("security/totp") totp(@Req() r: AuthRequest, @Body() b: any) {
    return this.auth.totp(r.user, b);
  }
  @Get("security/sessions") sessions(@Req() r: AuthRequest) {
    return this.app.sessions(r.user);
  }
  @Delete("security/sessions/:id") revoke(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.db.session.deleteMany({ where: { id, userId: r.user.id } });
  }
  @Post("keys") key(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.key(r.user, b);
  }
  @Post("webhooks") webhook(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.webhook(r.user, b);
  }
  @Delete("resources/:resource/:id") resource(
    @Req() r: AuthRequest,
    @Param("resource") resource: string,
    @Param("id") id: string,
  ) {
    return this.app.deleteResource(r.user, resource, id);
  }
  @Post("integrations/:provider/authorize") authorize(
    @Req() r: AuthRequest,
    @Param("provider") p: string,
  ) {
    return this.integrations.authorize(r.user, p);
  }
  @Patch("integrations/:provider") configure(
    @Req() r: AuthRequest,
    @Param("provider") p: string,
    @Body() b: any,
  ) {
    return this.integrations.configure(r.user, p, b);
  }
  @Get("integrations/google/calendar") calendar(@Req() r: AuthRequest) {
    return this.integrations.calendar(r.user);
  }
  @Get("integrations/:provider/recordings") recordings(
    @Req() r: AuthRequest,
    @Param("provider") p: string,
  ) {
    return this.integrations.recordings(r.user, p);
  }
  @Post("meetings/:id/import") importMeeting(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return this.integrations.importRecording(r.user, id, b);
  }
  @Post("integrations/export-action") exportAction(
    @Req() r: AuthRequest,
    @Body() b: any,
  ) {
    return this.integrations.export(r.user, b);
  }
  @Post("meetings/:id/notion") notion(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.integrations.notion(r.user, id);
  }
  @Post("billing/checkout") checkout(@Req() r: AuthRequest, @Body() b: any) {
    return this.app.checkout(r.user, b);
  }
  @Post("billing/portal") portal(@Req() r: AuthRequest) {
    return this.app.billingPortal(r.user);
  }
  @Patch("notifications/read") markRead(@Req() r: AuthRequest) {
    return this.db.notification.updateMany({
      where: { userId: r.user.id, workspaceId: r.user.workspaceId },
      data: { read: true },
    });
  }
}
@Controller("api")
export class PublicController {
  constructor(
    @Inject(Integrations) private integrations: Integrations,
    @Inject(AppService) private app: AppService,
  ) {}
  @Get("health") health() {
    return { status: "ok", service: "flowmind-api" };
  }
  @Get("integrations/:provider/callback") async callback(
    @Param("provider") p: string,
    @Query() q: any,
    @Res() res: Response,
  ) {
    res.redirect(await this.integrations.callback(p, q.code, q.state));
  }
  @Post("billing/webhook") stripe(@Req() r: AuthRequest) {
    return this.app.stripe(
      r.rawBody!,
      String(r.headers["stripe-signature"] || ""),
    );
  }
}
