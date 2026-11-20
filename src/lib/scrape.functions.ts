import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseMeta, type ScrapedMeta } from "./html-meta";
import { fetchPage } from "./safe-fetch.server";

export const scrapeUrl = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ url: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<ScrapedMeta> => {
    const { html, url } = await fetchPage(data.url);
    return parseMeta(html, url);
  });
