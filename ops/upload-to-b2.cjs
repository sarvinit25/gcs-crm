#!/usr/bin/env node
// Copies one backup file off this server into the Backblaze B2 backup bucket.
//
//   node ops/upload-to-b2.cjs /var/backups/gcs-crm/gcs-crm_2026-11-05_023000.dump
//
// Used as BACKUP_UPLOAD_CMD by ops/backup.sh (which appends the file path). The key it uses should be a
// WRITE-ONLY key limited to the backup bucket: the server can then send backups in but never read or delete them.
// Settings come from /etc/gcs-crm-backup.env (or the file named in BACKUP_ENV_FILE):
//   B2_ENDPOINT, B2_REGION, B2_BACKUP_BUCKET, B2_BACKUP_KEY_ID, B2_BACKUP_APPLICATION_KEY
const fs = require("fs");
const path = require("path");

const envFile = process.env.BACKUP_ENV_FILE || "/etc/gcs-crm-backup.env";
const env = { ...process.env };
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
const need = ["B2_ENDPOINT", "B2_REGION", "B2_BACKUP_BUCKET", "B2_BACKUP_KEY_ID", "B2_BACKUP_APPLICATION_KEY"];
const missing = need.filter((k) => !env[k]);
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error("Usage: upload-to-b2.cjs <backup file>"); process.exit(2); }
if (missing.length) { console.error("Missing settings: " + missing.join(", ")); process.exit(2); }

// The AWS client ships with the backend, so nothing extra is installed on the server.
const { S3Client, PutObjectCommand } = require(path.join(__dirname, "..", "backend", "node_modules", "@aws-sdk", "client-s3"));
const client = new S3Client({
  region: env.B2_REGION,
  endpoint: env.B2_ENDPOINT.startsWith("http") ? env.B2_ENDPOINT : `https://${env.B2_ENDPOINT}`,
  credentials: { accessKeyId: env.B2_BACKUP_KEY_ID, secretAccessKey: env.B2_BACKUP_APPLICATION_KEY },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
});
const key = `database/${path.basename(file)}`;
client
  .send(new PutObjectCommand({ Bucket: env.B2_BACKUP_BUCKET, Key: key, Body: fs.createReadStream(file), ContentLength: fs.statSync(file).size }))
  .then((r) => console.log(`Uploaded ${key} to ${env.B2_BACKUP_BUCKET} (version ${r.VersionId || "n/a"})`))
  .catch((e) => { console.error("Upload failed: " + (e.name || "") + " " + (e.message || e)); process.exit(1); });
