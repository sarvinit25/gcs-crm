import { detectFile, safeFileName } from "./file-sniff";

const pad = (head: Buffer) => Buffer.concat([head, Buffer.alloc(32)]);

describe("detectFile", () => {
  it("recognises PDF, JPEG, PNG, WebP and HEIC by their first bytes", () => {
    expect(detectFile(pad(Buffer.from("%PDF-1.7\n")))).toEqual({ mime: "application/pdf", extension: ".pdf" });
    expect(detectFile(pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])))?.mime).toBe("image/jpeg");
    expect(detectFile(pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))?.mime).toBe("image/png");
    expect(detectFile(pad(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])))?.mime).toBe("image/webp");
    expect(detectFile(pad(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypheic")])))?.mime).toBe("image/heic");
  });

  it("accepts a scanner's PDF with a few bytes before the header", () => {
    expect(detectFile(pad(Buffer.from("\r\n\r\n%PDF-1.4")))?.mime).toBe("application/pdf");
  });

  it("refuses anything else, whatever it is named", () => {
    for (const body of [
      "<html><script>alert(1)</script></html>",
      "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>",
      "MZ\u0090\u0000\u0003 windows executable",
      "#!/bin/sh\nrm -rf /",
      "PK\u0003\u0004 a zip or a docx",
    ]) {
      expect(detectFile(pad(Buffer.from(body)))).toBeNull();
    }
    expect(detectFile(Buffer.from("%PDF"))).toBeNull(); // too short to judge
  });

  it("does not take an mp4 or avif for a HEIC photo", () => {
    expect(detectFile(pad(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom")])))).toBeNull();
    expect(detectFile(pad(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypavif")])))).toBeNull();
  });
});

describe("safeFileName", () => {
  it("strips paths, control characters and header-breaking characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etcpasswd");
    expect(safeFileName('a"b\r\nSet-Cookie: x=1.pdf')).not.toMatch(/["\r\n]/);
    expect(safeFileName("C:\\Users\\me\\pan card.pdf")).toBe("CUsersmepan card.pdf");
  });

  it("keeps ordinary and non-English names, and caps the length", () => {
    expect(safeFileName("Aadhaar front.pdf")).toBe("Aadhaar front.pdf");
    expect(safeFileName("आधार कार्ड.pdf")).toBe("आधार कार्ड.pdf");
    expect(safeFileName("x".repeat(500)).length).toBe(150);
  });

  it("falls back to a generic name when nothing is left", () => {
    expect(safeFileName("///", ".pdf")).toBe("document.pdf");
    expect(safeFileName("...", ".png")).toBe("document.png");
  });
});
