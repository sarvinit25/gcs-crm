import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { detectFile, safeFileName } from "../documents/file-sniff";
import { StorageService } from "../documents/storage.service";
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from "./whatsapp.provider";

const MAX_BYTES = 15 * 1024 * 1024;

export type SavedFile = { saved: true; fileName: string } | { saved: false; reason: "unsupported" | "too_large" | "failed" };

/**
 * Keeps a file a customer sent on WhatsApp: fetched from Meta, checked by its contents (the same rule as staff uploads),
 * filed in the private bucket and listed on the lead. Nothing is ever read out of it here.
 */
@Injectable()
export class MediaService {
  private readonly log = new Logger("WhatsAppMedia");

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    @Inject(WHATSAPP_PROVIDER) private provider: WhatsAppProvider,
  ) {}

  async save(input: { leadId: string; mediaId: string; fileName?: string | null; caption?: string | null }): Promise<SavedFile> {
    try {
      const { data } = await this.provider.downloadMedia(input.mediaId);
      if (data.length > MAX_BYTES) return { saved: false, reason: "too_large" };
      const detected = detectFile(data);
      if (!detected) return { saved: false, reason: "unsupported" };

      const fileName = safeFileName(input.fileName || `whatsapp-${new Date().toISOString().slice(0, 10)}${detected.extension}`, detected.extension);
      const objectKey = `whatsapp/${input.leadId}/${randomUUID()}${detected.extension}`;
      await this.storage.put(objectKey, data, detected.mime);
      await this.prisma.leadFile.create({
        data: { leadId: input.leadId, fileName, objectKey, mimeType: detected.mime, sizeBytes: data.length, source: "whatsapp", caption: input.caption?.slice(0, 500) || null },
      });
      return { saved: true, fileName };
    } catch (err) {
      this.log.error(`Could not save a WhatsApp file: ${(err as Error).message}`);
      return { saved: false, reason: "failed" };
    }
  }
}
