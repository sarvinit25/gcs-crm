import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";

export const API = "/crm/api";

/** The real app, configured as in main.ts. Throttling is off unless a test is about throttling. */
export async function createTestApp({ throttle = false }: { throttle?: boolean } = {}): Promise<INestApplication> {
  if (throttle) process.env.ENABLE_THROTTLE_IN_TESTS = "true";
  else delete process.env.ENABLE_THROTTLE_IN_TESTS;
  const app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  app.setGlobalPrefix(API);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}
