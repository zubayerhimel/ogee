import { describe, expect, it } from "vitest";
import { isPrivateAddress, isPrivateHostname } from "./net-guard";

const host = (raw: string) => new URL(`http://${raw}`).hostname;

describe("isPrivateHostname", () => {
  it.each([
    "localhost:3000",
    "app.localhost",
    "printer.local",
    "intranet",
    "127.0.0.1",
    "0x7f000001",
    "2130706433",
    "10.0.0.5",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "[::1]",
    "[::ffff:127.0.0.1]",
    "[::ffff:169.254.169.254]",
    "[64:ff9b::10.0.0.1]",
    "[fd00::1]",
    "[fe80::1]",
  ])("blocks %s", (raw) => {
    expect(isPrivateHostname(host(raw))).toBe(true);
  });

  it.each(["github.com", "10.example.com", "localhost.example.com", "8.8.8.8", "[2606:4700::1111]"])(
    "allows %s",
    (raw) => {
      expect(isPrivateHostname(host(raw))).toBe(false);
    },
  );
});

describe("isPrivateAddress", () => {
  it("checks resolved DNS addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:10.1.2.3")).toBe(true);
    expect(isPrivateAddress("140.82.112.3")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });
});
