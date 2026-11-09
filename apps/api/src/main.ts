import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { JwtModule } from "@nestjs/jwt";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { Db } from "./core";
import { AppService } from "./app.service";
import { AuthService, AccessGuard, JwtStrategy } from "./auth";
import { StorageService } from "./storage";
import { Queues } from "./queue";
import { Llm } from "./llm";
import { Notifications } from "./notifications";
import { ProcessingGateway } from "./gateway";
import { Processing } from "./processing";
import { Integrations } from "./integrations";
import {
  AppController,
  AuthController,
  PublicController,
} from "./app.controller";
@Catch()
class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const code =
      error instanceof HttpException
        ? error.getStatus()
        : error.code === "P2002"
          ? 409
          : 500;
    if (code === 500) console.error(error);
    res.status(code).json({
      statusCode: code,
      message:
        code === 500
          ? "An internal error occurred"
          : error instanceof HttpException
            ? error.getResponse()
            : code === 409
              ? "That record already exists"
              : error.message,
    });
  }
}
@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
  ],
  controllers: [AppController, AuthController, PublicController],
  providers: [
    Db,
    AppService,
    AuthService,
    AccessGuard,
    JwtStrategy,
    StorageService,
    Queues,
    Llm,
    Notifications,
    ProcessingGateway,
    Processing,
    Integrations,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
class AppModule {}
async function main() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must be at least 32 characters");
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: false,
  });
  app.use(helmet());
  app.use(cookieParser());
  const express = await import("express");
  app.use(
    express.json({
      limit: "2mb",
      verify(req: any, _res, buffer) {
        req.rawBody = buffer;
      },
    }),
  );
  const origins = (process.env.WEB_ORIGIN || "http://localhost:3000").split(
    ",",
  );
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", "Upload-Offset"],
    exposedHeaders: ["Upload-Offset"],
  });
  app.use((req: any, res: any, next: any) => {
    if (
      ["POST", "PATCH", "DELETE", "PUT"].includes(req.method) &&
      req.headers.origin &&
      !origins.includes(req.headers.origin)
    )
      return res.status(403).json({ message: "Origin denied" });
    next();
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4000), "0.0.0.0");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
