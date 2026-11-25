import sharp from "sharp";
import { compressFile } from "./file-compress";

// A big, busy picture like a phone photo of a document: random noise on a grey page.
async function photo(w: number, h: number, format: "jpeg" | "png" | "webp") {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = 120 + Math.floor(Math.random() * 60);
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })[format]({ quality: 95 }).toBuffer();
}

describe("compressFile", () => {
  it("shrinks a large phone photo and keeps it a JPEG within 2000 px", async () => {
    const big = await photo(3600, 2400, "jpeg");
    const r = await compressFile(big, "image/jpeg");
    expect(r.compressed).toBe(true);
    expect(r.contentType).toBe("image/jpeg");
    expect(r.body.length).toBeLessThan(big.length * 0.6);
    const meta = await sharp(r.body).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(2000);
  }, 60_000);

  it("keeps PNG as PNG and WebP as WebP", async () => {
    const png = await compressFile(await photo(2600, 1800, "png"), "image/png");
    expect(png.contentType).toBe("image/png");
    const webp = await compressFile(await photo(3000, 2000, "webp"), "image/webp");
    expect(webp.contentType).toBe("image/webp");
  }, 60_000);

  it("leaves a small file exactly as it came", async () => {
    const small = await photo(300, 200, "jpeg");
    const r = await compressFile(small, "image/jpeg");
    expect(r.compressed).toBe(false);
    expect(r.body).toBe(small);
  });

  it("never loses a file: unreadable bytes come back untouched", async () => {
    const junk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400_000, 7)]);
    const r = await compressFile(junk, "image/jpeg");
    expect(r.compressed).toBe(false);
    expect(r.body).toBe(junk);
  });

  it("leaves unknown types alone", async () => {
    const other = Buffer.alloc(500_000, 1);
    const r = await compressFile(other, "application/zip");
    expect(r.compressed).toBe(false);
    expect(r.contentType).toBe("application/zip");
  });

  it("keeps a PDF as it came when Ghostscript is not available", async () => {
    process.env.GS_BIN = "definitely-not-installed-gs";
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(400_000, 32)]);
    const r = await compressFile(pdf, "application/pdf");
    delete process.env.GS_BIN;
    expect(r.compressed).toBe(false);
    expect(r.body).toBe(pdf);
  });
});
