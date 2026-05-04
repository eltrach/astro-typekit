import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleFont, Inter } from "../src/google.js";
import { clearFontCss, collectFontCss } from "../src/runtime/registry.js";

describe("google fonts", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    clearFontCss();
    process.env.ASTRO_FONT_CACHE_DIR = await mkdtemp(join(tmpdir(), "astro-fontkit-google-cache-"));
  });

  afterEach(async () => {
    if (process.env.ASTRO_FONT_CACHE_DIR) {
      await rm(process.env.ASTRO_FONT_CACHE_DIR, { force: true, recursive: true });
      delete process.env.ASTRO_FONT_CACHE_DIR;
    }
    clearFontCss();
  });

  it("returns a Next-like font object and keeps Google font URLs external by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);

        if (href.startsWith("https://fonts.googleapis.com")) {
          return new Response(
            '@font-face{font-family:"Inter";src:url(https://fonts.gstatic.com/s/inter/v1/inter.woff2) format("woff2");font-weight:400;}',
          );
        }

        throw new Error(`Unexpected font file request: ${href}`);
      }),
    );

    const inter = Inter({
      subsets: ["latin"],
      weight: ["400", "700"],
      display: "swap",
      variable: "--font-inter",
      fallback: ["system-ui", "sans-serif"],
    });

    expect(inter.className).toMatch(/^__astro_font_/);
    expect(inter.variable).toMatch(/^__astro_font_variable_/);
    expect(inter.style.fontFamily).toContain('"Inter"');
    expect(inter.family).toContain('"Inter"');

    const css = await collectFontCss();

    expect(css).toContain("@font-face");
    expect(css).toContain("https://fonts.gstatic.com/s/inter/v1/inter.woff2");
    expect(css).not.toContain("data:font/woff2");
    expect(css).toContain("--font-inter");
  });

  it("can inline Google font files when requested", async () => {
    const fontBytes = new Uint8Array([1, 2, 3]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);

        if (href.startsWith("https://fonts.googleapis.com")) {
          return new Response(
            '@font-face{font-family:"Inter";src:url(https://fonts.gstatic.com/s/inter/v1/inter.woff2) format("woff2");font-weight:400;}',
          );
        }

        return new Response(fontBytes);
      }),
    );

    Inter({ strategy: "inline", weight: "400" });

    const css = await collectFontCss();

    expect(css).toContain("data:font/woff2;base64,AQID");
  });

  it("builds Google CSS URLs for weights, italics, display, and subsets", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);

      if (href.startsWith("https://fonts.googleapis.com")) {
        return new Response(
          '@font-face{font-family:"Specimen";src:url(https://fonts.gstatic.com/s/specimen/v1/specimen.woff2) format("woff2");}',
        );
      }

      return new Response(new Uint8Array([9]));
    });

    vi.stubGlobal("fetch", fetchMock);

    const Specimen = createGoogleFont("Specimen");
    Specimen({
      subsets: ["latin-ext"],
      weight: ["400", "700"],
      style: ["normal", "italic"],
      display: "optional",
    });

    await collectFontCss();

    const cssRequest = String(fetchMock.mock.calls[0]?.[0]);
    expect(cssRequest).toContain("family=Specimen:ital,wght@0,400;0,700;1,400;1,700");
    expect(cssRequest).toContain("display=optional");
    expect(cssRequest).toContain("subset=latin-ext");
  });

  it("caches Google CSS for repeated external font usage", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);

      if (href.startsWith("https://fonts.googleapis.com")) {
        return new Response(
          '@font-face{font-family:"Cache Specimen";src:url(https://fonts.gstatic.com/s/cache/v1/cache.woff2) format("woff2");}',
        );
      }

      throw new Error(`Unexpected font file request: ${href}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const CacheSpecimen = createGoogleFont("Cache Specimen");
    CacheSpecimen({ weight: "400", display: "fallback" });
    await collectFontCss();

    clearFontCss();
    CacheSpecimen({ weight: "400", display: "fallback" });
    const css = await collectFontCss();

    expect(css).toContain("https://fonts.gstatic.com/s/cache/v1/cache.woff2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("generates selector and variable selector rules for app-wide font application", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          '@font-face{font-family:"Cairo";src:url(https://fonts.gstatic.com/s/cairo/v1/cairo.woff2) format("woff2");}',
        ),
      ),
    );

    const Cairo = createGoogleFont("Cairo");
    Cairo({
      variable: "--font-cairo",
      fallback: ["Tahoma", "Arial", "sans-serif"],
      selector: ["html[lang='ar']", "body[dir='rtl']"],
      variableSelector: ":root",
    });

    const css = await collectFontCss();

    expect(css).toContain("html[lang='ar']");
    expect(css).toContain("body[dir='rtl']");
    expect(css).toContain(':root{--font-cairo: "Cairo", Tahoma, Arial, sans-serif;}');
    expect(css).toContain("--font-cairo");
  });

  it("surfaces failed Google CSS requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500, statusText: "Server Error" })),
    );

    const Failing = createGoogleFont("Failing Specimen");
    Failing();

    await expect(collectFontCss()).rejects.toThrow("Failed to download Google font CSS");
  });
});
