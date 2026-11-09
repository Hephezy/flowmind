import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { hash as bcryptHash, compare } from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { authenticator } from "otplib";
import {
  Db,
  Actor,
  hash,
  parse,
  encrypt,
  decrypt,
  audit,
  checkedFetch,
} from "./core";
import { signupSchema, loginSchema } from "@flowmind/shared";
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(Db) private db: Db) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }
  async validate(p: any) {
    const session = await this.db.session.findFirst({
      where: { id: p.sid, userId: p.sub, expiresAt: { gt: new Date() } },
    });
    const membership = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: p.wid, userId: p.sub } },
    });
    if (!session || !membership) throw new UnauthorizedException();
    return {
      id: p.sub,
      workspaceId: p.wid,
      role: membership.role,
      sessionId: p.sid,
    } satisfies Actor;
  }
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request & { user: Actor }>();
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer fm_")) {
      const key = await this.db.apiKey.findUnique({
        where: { keyHash: hash(auth.slice(7)) },
      });
      if (!key || (key.expiresAt && key.expiresAt < new Date()))
        throw new UnauthorizedException();
      const permissions = key.permissions as string[];
      const section = req.path
        .split("/")
        .find((x) =>
          ["meetings", "uploads", "actions", "webhooks"].includes(x),
        );
      const permission = `${section === "uploads" ? "meetings" : section || "workspace"}:${req.method === "GET" ? "read" : "write"}`;
      if (!permissions.includes(permission) || req.path.includes("bootstrap"))
        throw new ForbiddenException("API key does not grant this operation");
      const membership = await this.db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: key.workspaceId,
            userId: key.createdBy,
          },
        },
      });
      if (!membership) throw new UnauthorizedException();
      req.user = {
        id: key.createdBy,
        workspaceId: key.workspaceId,
        role: membership.role,
        permissions,
      };
      await this.db.apiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      });
      return true;
    }
    try {
      const p = this.jwt.verify(auth.replace(/^Bearer /, ""));
      const [session, m] = await Promise.all([
        this.db.session.findFirst({
          where: { id: p.sid, userId: p.sub, expiresAt: { gt: new Date() } },
        }),
        this.db.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: p.wid, userId: p.sub } },
        }),
      ]);
      if (!session || !m) throw new Error();
      req.user = {
        id: p.sub,
        workspaceId: p.wid,
        role: m.role,
        sessionId: p.sid,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Sign in required");
    }
  }
}
@Injectable()
export class AuthService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
  ) {}
  async tokens(
    userId: string,
    workspaceId: string,
    req: Request,
    res: Response,
  ) {
    await audit(
      this.db,
      { id: userId, workspaceId, role: "member" },
      "security.login",
      { userAgent: (req.headers["user-agent"] || "").slice(0, 300) },
    );
    const refresh = randomBytes(48).toString("hex");
    const session = await this.db.session.create({
      data: {
        userId,
        workspaceId,
        refreshHash: hash(refresh),
        userAgent: (req.headers["user-agent"] || "").slice(0, 300),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    res.cookie("fm_refresh", refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.COOKIE_CROSS_SITE === "true" ? "none" : "lax",
      path: "/api/auth",
      maxAge: 30 * 86400000,
    });
    return {
      accessToken: this.jwt.sign(
        { sub: userId, wid: workspaceId, sid: session.id },
        { expiresIn: "15m" },
      ),
      workspaceId,
    };
  }
  async signup(body: unknown, req: Request, res: Response) {
    const b = parse(signupSchema, body);
    try {
      new Intl.DateTimeFormat("en", { timeZone: b.timezone });
    } catch {
      throw new BadRequestException("Invalid timezone");
    }
    const passwordHash = await bcryptHash(b.password, 12);
    const user = await this.db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: b.name,
          email: b.email,
          passwordHash,
          timezone: b.timezone,
        },
      });
      const w = await tx.workSpace.create({
        data: {
          name: b.workspace,
          slug:
            b.workspace
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .slice(0, 50) +
            "-" +
            randomBytes(3).toString("hex"),
          ownerId: u.id,
          referredBy: b.referral || null,
          members: { create: { userId: u.id, role: "owner" } },
        },
      });
      return { id: u.id, workspaceId: w.id };
    });
    if (process.env.RESEND_API_KEY) await this.issue(user.id, "verify");
    return this.tokens(user.id, user.workspaceId, req, res);
  }
  async login(body: unknown, req: Request, res: Response) {
    const b = parse(loginSchema, body);
    const u = await this.db.user.findUnique({
      where: { email: b.email },
      include: { memberships: true },
    });
    if (!u || !(await compare(b.password, u.passwordHash)))
      throw new UnauthorizedException("Email or password is incorrect");
    if (u.totpEnabled) {
      const validTotp =
        !!b.code && authenticator.check(b.code, decrypt(u.totpSecret!));
      if (!validTotp) {
        const backupHash = hash(b.code || ""),
          codes = u.totpBackupCodes as string[];
        if (!b.code || !codes.includes(backupHash))
          throw new UnauthorizedException(
            "A valid two-factor code is required",
          );
        await this.db.user.update({
          where: { id: u.id },
          data: { totpBackupCodes: codes.filter((c) => c !== backupHash) },
        });
      }
    }
    if (!u.memberships.length)
      throw new ForbiddenException("No active workspace");
    return this.tokens(u.id, u.memberships[0].workspaceId, req, res);
  }
  async refresh(req: Request, res: Response) {
    const value = req.cookies?.fm_refresh;
    if (!value) throw new UnauthorizedException();
    const s = await this.db.session.findUnique({
      where: { refreshHash: hash(value) },
    });
    if (!s || s.expiresAt < new Date()) throw new UnauthorizedException();
    const m = await this.db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: s.workspaceId, userId: s.userId },
      },
    });
    if (!m) throw new UnauthorizedException();
    const fresh = randomBytes(48).toString("hex");
    const rotated = await this.db.session.updateMany({
      where: { id: s.id, refreshHash: hash(value) },
      data: { refreshHash: hash(fresh) },
    });
    if (!rotated.count) throw new UnauthorizedException();
    res.cookie("fm_refresh", fresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.COOKIE_CROSS_SITE === "true" ? "none" : "lax",
      path: "/api/auth",
      maxAge: 30 * 86400000,
    });
    return {
      accessToken: this.jwt.sign(
        { sub: s.userId, wid: m.workspaceId, sid: s.id },
        { expiresIn: "15m" },
      ),
    };
  }
  async logout(req: Request, res: Response) {
    if (req.cookies?.fm_refresh)
      await this.db.session.deleteMany({
        where: { refreshHash: hash(req.cookies.fm_refresh) },
      });
    res.clearCookie("fm_refresh", { path: "/api/auth" });
    return { ok: true };
  }
  async password(a: Actor, b: any) {
    if (
      typeof b.password !== "string" ||
      b.password.length < 12 ||
      b.password.length > 128
    )
      throw new BadRequestException("Password must be 12–128 characters");
    const u = await this.db.user.findUniqueOrThrow({ where: { id: a.id } });
    if (!(await compare(String(b.currentPassword || ""), u.passwordHash)))
      throw new UnauthorizedException("Current password is incorrect");
    await this.db.$transaction([
      this.db.user.update({
        where: { id: a.id },
        data: { passwordHash: await bcryptHash(b.password, 12) },
      }),
      this.db.session.deleteMany({
        where: { userId: a.id, id: { not: a.sessionId } },
      }),
    ]);
    await audit(this.db, a, "security.password_changed");
    return { ok: true };
  }
  async totp(a: Actor, b: any) {
    if (b.action === "setup") {
      const existing = await this.db.user.findUniqueOrThrow({
        where: { id: a.id },
      });
      if (existing.totpEnabled)
        throw new BadRequestException(
          "Disable the existing authenticator with a code before replacing it",
        );
      const secret = authenticator.generateSecret();
      await this.db.user.update({
        where: { id: a.id },
        data: { totpSecret: encrypt(secret), totpEnabled: false },
      });
      return { secret, uri: authenticator.keyuri(a.id, "FlowMind", secret) };
    }
    const u = await this.db.user.findUniqueOrThrow({ where: { id: a.id } });
    if (
      !u.totpSecret ||
      !authenticator.check(String(b.code), decrypt(u.totpSecret))
    )
      throw new BadRequestException("Incorrect code");
    const backupCodes =
      b.action === "disable"
        ? []
        : Array.from({ length: 8 }, () => randomBytes(6).toString("hex"));
    await this.db.user.update({
      where: { id: a.id },
      data: {
        totpBackupCodes: backupCodes.map(hash),
        totpEnabled: b.action !== "disable",
        ...(b.action === "disable" ? { totpSecret: null } : {}),
      },
    });
    return { ok: true, backupCodes };
  }
  async issue(userId: string, kind: string) {
    if (!process.env.RESEND_API_KEY)
      throw new ServiceUnavailableException("Email delivery is not configured");
    const user = await this.db.user.findUniqueOrThrow({
        where: { id: userId },
      }),
      value = randomBytes(32).toString("hex");
    await this.db.authToken.create({
      data: {
        userId,
        kind,
        tokenHash: hash(value),
        expiresAt: new Date(
          Date.now() + (kind === "reset" ? 3600000 : 86400000),
        ),
      },
    });
    const url = `${process.env.WEB_ORIGIN?.split(",")[0]}/#${kind}/${value}`;
    await checkedFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: user.email,
        subject:
          kind === "reset"
            ? "Reset your FlowMind password"
            : "Verify your FlowMind email",
        text: `${kind === "reset" ? "Reset your password" : "Verify your email"}: ${url}`,
      }),
    });
    return { ok: true };
  }
  async forgot(body: any) {
    if (!process.env.RESEND_API_KEY)
      throw new ServiceUnavailableException("Email delivery is not configured");
    const email = String(body.email || "").toLowerCase();
    const user = await this.db.user.findUnique({ where: { email } });
    if (user) await this.issue(user.id, "reset");
    return {
      message: "If this email has an account, a reset link has been sent.",
    };
  }
  async token(body: any, kind: string) {
    const token = await this.db.authToken.findUnique({
      where: { tokenHash: hash(String(body.token || "")) },
    });
    if (
      !token ||
      token.kind !== kind ||
      token.usedAt ||
      token.expiresAt < new Date()
    )
      throw new BadRequestException(
        "This link has expired or already been used",
      );
    if (
      kind === "reset" &&
      (typeof body.password !== "string" ||
        body.password.length < 12 ||
        body.password.length > 128)
    )
      throw new BadRequestException("Use a password of 12–128 characters");
    const passwordHash =
      kind === "reset" ? await bcryptHash(body.password, 12) : undefined;
    await this.db.$transaction(async (tx) => {
      const claimed = await tx.authToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!claimed.count) throw new BadRequestException("Link already used");
      await tx.user.update({
        where: { id: token.userId },
        data: kind === "reset" ? { passwordHash } : { emailVerified: true },
      });
      if (kind === "reset")
        await tx.session.deleteMany({ where: { userId: token.userId } });
    });
    return { ok: true };
  }
}
