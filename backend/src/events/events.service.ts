import { Injectable, Logger } from "@nestjs/common";

type Handler = (payload: Record<string, unknown>) => void | Promise<void>;

/**
 * A tiny in-process bus. Leads, files and sanctions announce what happened;
 * anything that cares (WhatsApp notifications today) listens. It keeps those
 * services from depending on the messaging code, and a slow or failing
 * listener can never hold up, or break, the save that triggered it.
 */
@Injectable()
export class EventsService {
  private readonly log = new Logger("Events");
  private handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  /** Fire and forget: returns at once, and listener errors are logged, not thrown. */
  emit(event: string, payload: Record<string, unknown>) {
    for (const handler of this.handlers.get(event) ?? []) {
      void Promise.resolve()
        .then(() => handler(payload))
        .catch((err: Error) => this.log.error(`${event} listener failed: ${err.message}`));
    }
  }
}
