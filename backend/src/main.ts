import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Nginx fronts this app, so without trusting it every request reads as
  // 127.0.0.1 and per-IP rate limiting would throttle all users as one.
  const proxyHops = config.get<number>("TRUST_PROXY_HOPS", 0);
  if (proxyHops > 0) app.set("trust proxy", proxyHops);

  app.setGlobalPrefix(config.get<string>("API_PREFIX", "/crm/api"));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // In production Nginx serves both apps from one origin, so CORS only matters in dev.
  const origin = config.get<string>("CORS_ORIGIN");
  if (origin) app.enableCors({ origin: origin.split(","), credentials: true });

  await app.listen(config.get<number>("PORT", 4000));
}

void bootstrap();
