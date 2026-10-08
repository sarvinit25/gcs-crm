import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage for KYC and loan files. Backblaze B2 in production, MinIO
 * locally — both speak S3, so this is the same code path either way. Files
 * never sit on the VPS disk; Postgres only holds the object key.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(private config: ConfigService) {
    this.bucket = config.get<string>("B2_BUCKET", "");
    this.client = new S3Client({
      endpoint: config.get<string>("B2_ENDPOINT"),
      region: config.get<string>("B2_REGION", "us-east-1"),
      credentials: {
        accessKeyId: config.get<string>("B2_KEY_ID", ""),
        secretAccessKey: config.get<string>("B2_APP_KEY", ""),
      },
      // MinIO serves buckets as a path, not a subdomain.
      forcePathStyle: true,
    });
  }

  async onModuleInit() {
    if (!this.bucket) {
      this.logger.warn("B2_BUCKET not set — document upload will fail until storage is configured");
      return;
    }
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Document storage ready (bucket: ${this.bucket})`);
    } catch {
      this.logger.warn(`Cannot reach bucket "${this.bucket}" — check storage credentials`);
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  /**
   * Short-lived link so the browser pulls the file straight from storage
   * instead of streaming it back through the VPS.
   */
  signedDownloadUrl(key: string, fileName: string, expiresIn = 300, contentType?: string) {
    // Always a download, never rendered in the browser; the name is made header-safe,
    // with the real (possibly non-English) name carried in the RFC 5987 form.
    const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        ...(contentType ? { ResponseContentType: contentType } : {}),
      }),
      { expiresIn },
    );
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
