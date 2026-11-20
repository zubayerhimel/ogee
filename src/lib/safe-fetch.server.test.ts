import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => [
    { address: host === "rebind.example" ? "10.0.0.7" : "93.184.215.14", family: 4 },
  ]),
}));

const { safeFetch } = await import("./safe-fetch.server");

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

afterEach(() => vi.unstubAllGlobals());

describe("safeFetch", () => {
  it("re-validates redirect targets", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirect("http://127.0.0.1/admin"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("https://public.example/")).rejects.toThrow("LOCAL_URL");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks public hostnames that resolve to private IPs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("https://rebind.example/")).rejects.toThrow("LOCAL_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows safe redirects and reports the final URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(redirect("/next")).mockResolvedValueOnce(new Response("ok")),
    );
    const { response, url } = await safeFetch("https://public.example/start");
    expect(await response.text()).toBe("ok");
    expect(url.toString()).toBe("https://public.example/next");
  });
});
