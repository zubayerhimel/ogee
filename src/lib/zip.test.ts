import { describe, expect, it } from "vitest";
import { crc32, createZip } from "./zip";

const enc = (s: string) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(enc("123456789"))).toBe(0xcbf43926);
  });
});

describe("createZip", () => {
  it("writes stored entries with a central directory that points back at them", () => {
    const zip = createZip([
      { name: "a.png", data: enc("hello") },
      { name: "b-1200x630.png", data: enc("world!") },
    ]);
    const view = new DataView(zip.buffer);
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    const cdSize = view.getUint32(eocd + 12, true);
    const cdStart = view.getUint32(eocd + 16, true);
    expect(cdStart + cdSize).toBe(eocd);
    // Second central record → its local header → its data.
    const second = cdStart + 46 + "a.png".length;
    expect(view.getUint32(second, true)).toBe(0x02014b50);
    const local = view.getUint32(second + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const nameLen = view.getUint16(local + 26, true);
    const data = zip.slice(local + 30 + nameLen, local + 30 + nameLen + 6);
    expect(new TextDecoder().decode(data)).toBe("world!");
    expect(view.getUint32(local + 14, true)).toBe(crc32(enc("world!")));
  });
});
