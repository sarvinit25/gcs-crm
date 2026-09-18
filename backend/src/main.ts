import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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
