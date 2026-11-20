// Isomorphic checks for hostnames/IPs that must never be fetched server-side
// (loopback, private networks, link-local, cloud metadata, etc).

function parseIPv4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : Number.NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

function isPrivateIPv4([a = 0, b = 0, c = 0]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function parseIPv6(input: string): number[] | null {
  let s = input.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const v4Tail = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const v4 = parseIPv4(v4Tail[2] ?? "");
    if (!v4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    s = `${v4Tail[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (/^[\da-f]{1,4}$/i.test(g) ? Number.parseInt(g, 16) : Number.NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

function isPrivateIPv6(g: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const embeddedV4 = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
  const zeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

  if (zeroPrefix && g5 === 0 && g6 === 0 && g7 <= 1) return true; // :: and ::1
  if (zeroPrefix && (g5 === 0xffff || g5 === 0)) return isPrivateIPv4(embeddedV4(g6, g7)); // v4-mapped / v4-compatible
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPrivateIPv4(embeddedV4(g6, g7)); // NAT64
  }
  if (g0 === 0x2002) return isPrivateIPv4(embeddedV4(g1, g2)); // 6to4
  return (
    (g0 & 0xfe00) === 0xfc00 || // unique local
    (g0 & 0xffc0) === 0xfe80 || // link-local
    (g0 & 0xff00) === 0xff00 // multicast
  );
}

/** True when `ip` is a literal IPv4/IPv6 address in a non-public range. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPrivateIPv4(v4);
  const v6 = parseIPv6(ip);
  return v6 ? isPrivateIPv6(v6) : false;
}

/** True for hostnames that obviously point at a local or private machine. */
export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h.startsWith("[") || h.includes(":")) {
    const v6 = parseIPv6(h);
    return v6 ? isPrivateIPv6(v6) : true;
  }
  const v4 = parseIPv4(h);
  if (v4) return isPrivateIPv4(v4);
  if (!h.includes(".")) return true;
  return /\.(localhost|local|internal|lan|home\.arpa)$/.test(h);
}
