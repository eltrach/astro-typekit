import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import localFont from "../src/local.js";
import { setFontRuntimeConfig } from "../src/runtime/config.js";
import { clearFontCss, collectFontAssets, collectFontCss } from "../src/runtime/registry.js";

const originalCwd = process.cwd();
const fixtureDir = join(originalCwd, ".tmp-test-fonts");
const runtimeConfigSymbol = Symbol.for("astro-fontkit.runtime-config");

describe("local fonts", () => {
  beforeEach(async () => {
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(join(fixtureDir, "MyFont.woff2"), new Uint8Array([4, 5, 6]));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    clearFontCss();
    delete (globalThis as { [runtimeConfigSymbol]?: unknown })[runtimeConfigSymbol];
    delete process.env.ASTRO_FONT_MODE;
    delete process.env.ASTRO_FONT_OUT_DIR;
    delete process.env.ASTRO_FONT_ASSETS_DIR;
    delete process.env.ASTRO_FONT_BASE;
    await rm(fixtureDir, { force: true, recursive: true });
  });

  it("inlines local files and returns class metadata", async () => {
    const font = localFont({
      src: "./.tmp-test-fonts/MyFont.woff2",
      weight: "700",
      style: "normal",
      variable: "--font-brand",
    });

    expect(font.className).toMatch(/^__astro_font_/);
    expect(font.style.fontWeight).toBe("700");

    const css = await collectFontCss();

    expect(css).toContain("@font-face");
    expect(css).toContain("data:font/woff2;base64,BAUG");
    expect(css).toContain("font-weight: 700");
    expect(css).toContain("--font-brand");
  });

  it("keeps public URLs external and preloads them by default", async () => {
    const font = localFont({
      src: "/fonts/Public.woff2",
      weight: "400",
    });

    expect(font.style.fontWeight).toBe("400");

    const assets = await collectFontAssets();

    expect(assets.css).toContain('url("/fonts/Public.woff2")');
    expect(assets.preload).toEqual(["/fonts/Public.woff2"]);
  });

  it("supports multiple local sources without collapsing weights into style metadata", async () => {
    await writeFile(join(fixtureDir, "MyFont-Bold.woff2"), new Uint8Array([7, 8, 9]));

    const font = localFont({
      src: [
        { path: "./.tmp-test-fonts/MyFont.woff2", weight: "400", style: "normal" },
        { path: "./.tmp-test-fonts/MyFont-Bold.woff2", weight: "700", style: "normal" },
      ],
      variable: "--font-family",
    });

    expect(font.style.fontWeight).toBeUndefined();

    const css = await collectFontCss();

    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain("font-weight: 400");
    expect(css).toContain("font-weight: 700");
    expect(css).toContain("--font-family");
  });

  it("emits hashed assets and preloads them in build mode", async () => {
    const outDir = join(fixtureDir, "dist");
    setFontRuntimeConfig({
      mode: "build",
      outDir,
      assetsDir: "_assets",
      base: "/blog/",
    });

    localFont({
      src: "./.tmp-test-fonts/MyFont.woff2",
      weight: "500",
    });

    const assets = await collectFontAssets();
    const emittedUrl = assets.preload[0];

    expect(emittedUrl).toMatch(/^\/blog\/_assets\/MyFont\.[a-z0-9]+\.woff2$/);
    expect(assets.css).toContain(`url("${emittedUrl}")`);

    const emittedPath = join(outDir, emittedUrl!.replace("/blog/", ""));
    await expect(stat(emittedPath)).resolves.toMatchObject({ size: 3 });
    await expect(readFile(emittedPath)).resolves.toEqual(Buffer.from([4, 5, 6]));
  });

  it("can disable preloads", async () => {
    localFont({
      src: "/fonts/NoPreload.woff2",
      preload: false,
    });

    const assets = await collectFontAssets();

    expect(assets.css).toContain("/fonts/NoPreload.woff2");
    expect(assets.preload).toEqual([]);
  });
});
