/**
 * Minimal ZIP writer. Entries are stored uncompressed: the images inside are already
 * compressed, so deflating them again would cost time and save next to nothing.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC_TABLE[(crc ^ data[i]!) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function createZip(entries: ZipEntry[], modified = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modified);
  const files = entries.map((e) => ({ ...e, nameBytes: encoder.encode(e.name), crc: crc32(e.data) }));

  const localSize = files.reduce((n, f) => n + 30 + f.nameBytes.length + f.data.length, 0);
  const centralSize = files.reduce((n, f) => n + 46 + f.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number) => {
    view.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(p, v >>> 0, true);
    p += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, p);
    p += b.length;
  };
  // Shared fields: version needed, UTF-8 names flag, method "stored", timestamps, sizes.
  const common = (f: (typeof files)[number]) => {
    u16(20);
    u16(0x0800);
    u16(0);
    u16(time);
    u16(date);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.nameBytes.length);
    u16(0);
  };

  const offsets: number[] = [];
  for (const f of files) {
    offsets.push(p);
    u32(0x04034b50);
    common(f);
    bytes(f.nameBytes);
    bytes(f.data);
  }
  const centralStart = p;
  files.forEach((f, i) => {
    u32(0x02014b50);
    u16(20); // version made by
    common(f);
    u16(0); // comment length
    u16(0); // disk number
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i] ?? 0);
    bytes(f.nameBytes);
  });
  const centralEnd = p;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(centralEnd - centralStart);
  u32(centralStart);
  u16(0);
  return out;
}
