export const SITE_NAME = "OGee";
export const SITE_TITLE = "OGee — Open Graph image generator and tag checker";
export const SITE_DESCRIPTION =
  "Paste a URL, design its social preview image, export it at 1200×630, and check that its Open Graph and Twitter tags are set up right.";

const IMAGE_ALT =
  "The OGee logo, an S-shaped ogee curve framed by printer's crop marks, next to the line: Design the image your link shows when it's shared, then check its tags.";

/**
 * Share tags for every page. Crawlers need absolute image URLs, so they're built
 * from the origin the page is served on rather than a hard-coded domain.
 */
export function siteMeta(origin: string) {
  const image = `${origin}/og.png`;
  return [
    { title: SITE_TITLE },
    { name: "description", content: SITE_DESCRIPTION },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: "website" },
    { property: "og:title", content: SITE_TITLE },
    { property: "og:description", content: SITE_DESCRIPTION },
    { property: "og:image", content: image },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: IMAGE_ALT },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: SITE_TITLE },
    { name: "twitter:description", content: SITE_DESCRIPTION },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: IMAGE_ALT },
  ];
}
