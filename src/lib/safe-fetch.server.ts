/// <reference types="node" />
import { withScheme } from "./html-meta";
import { isPrivateAddress, isPrivateHostname } from "./net-guard";

const USER_AGENT = "Mozilla/5.0 (compatible; OGStudioBot/1.0)";
const LOOKUP_FAILURES = new Set(["ENOTFOUND", "ENODATA", "EAI_AGAIN", "EAI_NONAME"]);

// Returns null when DNS isn't available in the runtime, so the literal-host check still applies.
async function resolveAddresses(hostname: string): Promise<string[] | null> {
  let lookup: typeof import("node:dns/promises").lookup;
  try {
    ({ lookup } = await import("node:dns/promises"));
  } catch {
    return null;
  }
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((r) => r.address);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code && LOOKUP_FAILURES.has(code)) throw new Error(`Couldn't resolve ${hostname}.`);
    return null;
  }
}

/** Throws `LOCAL_URL` when the URL targets (or resolves to) a non-public address. */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported.");
  }
  if (isPrivateHostname(url.hostname)) throw new Error("LOCAL_URL");
  const addresses = await resolveAddresses(url.hostname.replace(/^\[|\]$/g, ""));
  if (addresses?.some(isPrivateAddress)) throw new Error("LOCAL_URL");
}

/** fetch() that re-validates the target on every redirect hop. */
export async function safeFetch(
  input: string | URL,
  init: Omit<RequestInit, "headers" | "redirect"> & { headers?: Record<string, string> } = {},
  maxRedirects = 5,
): Promise<{ response: Response; url: URL }> {
  let url = new URL(input);
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, ...init.headers },
      redirect: "manual",
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return { response, url };
    await response.body?.cancel();
    if (hop >= maxRedirects) throw new Error("Too many redirects.");
    url = new URL(location, url);
  }
}

/** Reads at most `maxBytes`; either truncates or throws when the body is larger. */
export async function readBody(
  response: Response,
  maxBytes: number,
  { truncate = false } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > maxBytes) {
      await reader.cancel();
      if (!truncate) throw new Error("Response is too large.");
      chunks.push(value.subarray(0, maxBytes - size));
      size = maxBytes;
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Fetches a public page's HTML (first 500 KB) for metadata parsing. */
export async function fetchPage(raw: string): Promise<{ html: string; url: string }> {
  const { response, url } = await safeFetch(withScheme(raw), {
    headers: { Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Site responded with ${response.status}`);
  const body = await readBody(response, 500_000, { truncate: true });
  return { html: new TextDecoder().decode(body), url: url.toString() };
}
