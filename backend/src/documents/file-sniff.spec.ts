import { detectFile, detectMedia, safeFileName } from "./file-sniff";

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


describe("detectMedia (what a customer sends on WhatsApp)", () => {
  const box = (brand: string) => pad(Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from(brand)]));
  it("still accepts everything detectFile does", () => {
    expect(detectMedia(pad(Buffer.from("%PDF-1.7\n")))?.mime).toBe("application/pdf");
    expect(detectMedia(pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])))?.mime).toBe("image/jpeg");
  });
  it("recognises videos and voice notes by their first bytes", () => {
    expect(detectMedia(box("isom"))).toEqual({ mime: "video/mp4", extension: ".mp4" });
    expect(detectMedia(box("mp42"))?.mime).toBe("video/mp4");
    expect(detectMedia(box("qt  "))?.mime).toBe("video/quicktime");
    expect(detectMedia(box("3gp4"))?.mime).toBe("video/3gpp");
    expect(detectMedia(box("M4A "))?.mime).toBe("audio/mp4");
    expect(detectMedia(pad(Buffer.from("OggS")))?.mime).toBe("audio/ogg");
    expect(detectMedia(pad(Buffer.from("#!AMR\n")))?.mime).toBe("audio/amr");
    expect(detectMedia(pad(Buffer.from("ID3")))?.mime).toBe("audio/mpeg");
  });
  it("recognises Word, Excel and PowerPoint, but not just any zip", () => {
    const zip = (name: string) => pad(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from(name)]));
    expect(detectMedia(zip("word/document.xml"))?.extension).toBe(".docx");
    expect(detectMedia(zip("xl/workbook.xml"))?.extension).toBe(".xlsx");
    expect(detectMedia(zip("ppt/presentation.xml"))?.extension).toBe(".pptx");
    expect(detectMedia(zip("malware/payload.exe"))).toBeNull();
    expect(detectMedia(pad(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])))?.extension).toBe(".doc");
  });
  it("still refuses programs, scripts and web pages, whatever they are named", () => {
    for (const body of ["<html><script>alert(1)</script></html>", "MZ\u0090\u0000\u0003 windows executable", "#!/bin/sh\nrm -rf /", "<svg onload='alert(1)'/>"]) {
      expect(detectMedia(pad(Buffer.from(body)))).toBeNull();
    }
  });
});
