import { deflateRawSync } from "zlib";
import { isDocx, isOldWord, readDocx, xmlToText } from "./docx-text";

function crc32(buf: Buffer) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

/** A minimal zip, written by hand, so the reader is tested on the real file layout. */
function zip(files: Record<string, Buffer | string>, compress = true) {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const packed = compress ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, packed);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(compress ? 8 : 0, 10);
    head.writeUInt32LE(crc32(data), 16);
    head.writeUInt32LE(packed.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, dir, end]);
}

const DOC = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:r><w:t>Manba Finance &amp; Co</w:t></w:r></w:p>
<w:p><w:r><w:t>Micro LAP</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>19% to 20%</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Amount</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>10 to 20 Lakhs</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Tenure</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12 to 120 months</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;
const BASE = { "[Content_Types].xml": "<Types/>", "word/document.xml": DOC };

describe("reading a Word (.docx) file", () => {
  it.each([true, false])("recognises it and reads the text, tables included (compressed: %s)", (compress) => {
    const buf = zip(BASE, compress);
    expect(isDocx(buf)).toBe(true);
    const { text } = readDocx(buf);
    expect(text).toContain("Manba Finance & Co");
    expect(text).toContain("Micro LAP\t19% to 20%");
    expect(text).toContain("Amount | 10 to 20 Lakhs");
    expect(text).toContain("Tenure | 12 to 120 months");
  });

  it("takes the pictures out of a flyer that was pasted into Word as an image", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3000, 7)]);
    const { text, images } = readDocx(zip({ ...BASE, "word/document.xml": "<w:document><w:body><w:p/></w:body></w:document>", "word/media/image1.png": png }));
    expect(text).toBe("");
    expect(images).toHaveLength(1);
    expect(images[0]!.mime).toBe("image/png");
  });

  it("does not take a zip that is not a Word file, or an old .doc, for a .docx", () => {
    expect(isDocx(zip({ "notes.txt": "hello" }))).toBe(false);
    expect(isDocx(Buffer.from("%PDF-1.4 not a zip at all............."))).toBe(false);
    const oldDoc = Buffer.alloc(64);
    oldDoc.writeUInt32BE(0xd0cf11e0, 0);
    oldDoc.writeUInt32BE(0xa1b11ae1, 4);
    expect(isOldWord(oldDoc)).toBe(true);
    expect(isDocx(oldDoc)).toBe(false);
  });

  it("copes with entities and numbered character references", () => {
    expect(xmlToText("<w:p><w:r><w:t>a &lt; b &#8377;5 &#x20B9;6</w:t></w:r></w:p>")).toBe("a < b ₹5 ₹6");
  });
});
