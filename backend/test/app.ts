import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/app-config";
import { AssistantService } from "../src/assistant/assistant.service";
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from "../src/whatsapp/whatsapp.provider";

export const API = "/crm/api";

/** The real app, configured as in main.ts. Throttling is off unless a test is about throttling. */
export async function createTestApp({
  throttle = false,
  assistant,
  whatsappProvider,
}: { throttle?: boolean; assistant?: Pick<AssistantService, "ask">; whatsappProvider?: WhatsAppProvider } = {}): Promise<INestApplication> {
  if (throttle) process.env.ENABLE_THROTTLE_IN_TESTS = "true";
  else delete process.env.ENABLE_THROTTLE_IN_TESTS;
  const builder = Test.createTestingModule({ imports: [AppModule] });
  // Anything that talks to the assistant is tested with a stand-in, so no test ever reaches OpenAI.
  if (assistant) builder.overrideProvider(AssistantService).useValue(assistant);
  if (whatsappProvider) builder.overrideProvider(WHATSAPP_PROVIDER).useValue(whatsappProvider);
  const app = (await builder.compile()).createNestApplication({ rawBody: true });
  configureApp(app, API);
  await app.init();
  return app;
}
