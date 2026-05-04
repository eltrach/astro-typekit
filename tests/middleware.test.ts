import { describe, expect, it } from "vitest";
import { onRequest } from "../src/middleware.js";
import { registerFont, registerFontCss } from "../src/runtime/registry.js";

describe("middleware", () => {
  it("injects registered CSS into HTML responses", async () => {
    const response = await onRequest({}, async () => {
      registerFontCss("test", ".font{font-family:test;}");

      return new Response("<html><head></head><body></body></html>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    });

    await expect(response.text()).resolves.toContain("<style data-astro-fontkit>");
  });

  it("injects escaped preload links before font CSS", async () => {
    const response = await onRequest({}, async () => {
      registerFont("test", {
        css: ".font{font-family:test;}",
        preload: ["/_astro/font.woff2?x=1&name=\"brand\""],
      });

      return new Response("<html><head></head><body></body></html>", {
        headers: {
          "content-type": "text/html",
          "content-length": "42",
        },
      });
    });

    const html = await response.text();

    expect(html).toContain('rel="preload"');
    expect(html).toContain('href="/_astro/font.woff2?x=1&amp;name=&quot;brand&quot;"');
    expect(html.indexOf('rel="preload"')).toBeLessThan(html.indexOf("<style data-astro-fontkit>"));
    expect(response.headers.has("content-length")).toBe(false);
  });

  it("keeps concurrent requests isolated", async () => {
    const [first, second] = await Promise.all([
      onRequest({}, async () => {
        registerFontCss("first", ".first{}");
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response("<html><head></head></html>", {
          headers: { "content-type": "text/html" },
        });
      }),
      onRequest({}, async () => {
        registerFontCss("second", ".second{}");
        return new Response("<html><head></head></html>", {
          headers: { "content-type": "text/html" },
        });
      }),
    ]);

    const firstHtml = await first.text();
    const secondHtml = await second.text();

    expect(firstHtml).toContain(".first{}");
    expect(firstHtml).not.toContain(".second{}");
    expect(secondHtml).toContain(".second{}");
    expect(secondHtml).not.toContain(".first{}");
  });

  it("leaves non-HTML responses alone", async () => {
    const response = await onRequest({}, async () => {
      registerFontCss("test", ".font{font-family:test;}");

      return new Response("{}", {
        headers: {
          "content-type": "application/json",
        },
      });
    });

    await expect(response.text()).resolves.toBe("{}");
  });

  it("does not inject duplicate style tags or preload links", async () => {
    const response = await onRequest({}, async () => {
      registerFont("test", {
        css: ".font{font-family:test;}",
        preload: ["/_astro/font.woff2"],
      });

      return new Response(
        '<html><head><link rel="preload" as="font" href="/_astro/font.woff2" crossorigin><style data-astro-fontkit></style></head></html>',
        {
          headers: {
            "content-type": "text/html",
          },
        },
      );
    });

    const html = await response.text();

    expect(html.match(/data-astro-fontkit/g)).toHaveLength(1);
    expect(html.match(/href="\/_astro\/font\.woff2"/g)).toHaveLength(1);
  });
});
