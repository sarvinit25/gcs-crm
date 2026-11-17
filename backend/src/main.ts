import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./common/app-config";
import { assertProductionConfig } from "./common/production-checks";

async function bootstrap() {
  assertProductionConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // Nginx fronts this app, so without trusting it every request reads as
  // 127.0.0.1 and per-IP rate limiting would throttle all users as one.
  // The setting arrives as text ("1"). Express reads a text value as a list of trusted addresses, not a count of hops, which
  // left every visitor looking like 127.0.0.1 and every per-person limit shared by everyone. It has to be a real number.
  const proxyHops = Number(config.get<string | number>("TRUST_PROXY_HOPS", 0));
  if (Number.isInteger(proxyHops) && proxyHops > 0) app.set("trust proxy", proxyHops);

  configureApp(app, config.get<string>("API_PREFIX", "/crm/api"));

  // In production Nginx serves both apps from one origin, so CORS only matters in dev.
  const origin = config.get<string>("CORS_ORIGIN");
  if (origin) app.enableCors({ origin: origin.split(","), credentials: true });

  await app.listen(config.get<number>("PORT", 4000));
}

void bootstrap();
