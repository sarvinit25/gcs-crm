import { ValidationPipe, type INestApplication } from "@nestjs/common";
import helmet from "helmet";
import { InputCeilingPipe } from "./input-ceiling.pipe";

/** Everything main.ts and the end-to-end tests share, so tests exercise the real settings. */
export function configureApp(app: INestApplication, prefix: string) {
  app.setGlobalPrefix(prefix);
  // This is a JSON API: it never serves pages, so the strictest content policy is safe here.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.useGlobalPipes(
    new InputCeilingPipe(),
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}
