import { describe, expect, it } from "vitest";
import { astroFontVitePlugin, transformLocalFontAssets } from "../src/vite-plugin.js";

describe("local font asset transform", () => {
  it("rewrites static local font sources to Vite asset URL imports", () => {
    const transformed = transformLocalFontAssets(
      [
        "---",
        'import localFont from "astro/font/local";',
        "const brand = localFont({",
        '  src: [{ path: "./fonts/Brand-Regular.woff2", weight: "400" }],',
        "});",
        "---",
        "<main />",
      ].join("\n"),
      "/project/src/pages/index.astro",
    );

    expect(transformed).toContain('import __astroFontAsset0 from "./fonts/Brand-Regular.woff2?url";');
    expect(transformed).toContain("path: __astroFontAsset0");
  });

  it("rewrites string src values in JavaScript modules and preserves existing query strings", () => {
    const transformed = transformLocalFontAssets(
      [
        'import localFont from "astro-fontkit/local";',
        "export const mono = localFont({",
        '  src: "../fonts/Mono.woff2?v=1",',
        "});",
      ].join("\n"),
      "/project/src/fonts.ts",
    );

    expect(transformed?.startsWith('import __astroFontAsset0 from "../fonts/Mono.woff2?v=1&url";')).toBe(true);
    expect(transformed).toContain("src: __astroFontAsset0");
  });

  it("ignores code without local font imports or without static relative font paths", () => {
    expect(transformLocalFontAssets('const src = "./font.woff2";', "/project/src/file.ts")).toBeUndefined();
    expect(
      transformLocalFontAssets(
        ['import localFont from "astro/font/local";', 'localFont({ src: "/fonts/Public.woff2" });'].join("\n"),
        "/project/src/file.ts",
      ),
    ).toBeUndefined();
  });

  it("resolves and loads virtual font modules with runtime config", async () => {
    const plugin = astroFontVitePlugin({
      localModulePath: "/pkg/dist/local.js",
      googleModulePath: "/pkg/dist/google.js",
      includePackageAliases: true,
      getRuntimeConfig: () => ({
        mode: "build",
        outDir: "/project/dist",
        assetsDir: "_astro",
        base: "/docs/",
      }),
    });
    const context = {} as never;
    const resolveId = plugin.resolveId as unknown as (this: never, id: string) => string | undefined;
    const load = plugin.load as unknown as (
      this: never,
      id: string,
      options?: { ssr?: boolean },
    ) => string | undefined;

    const localId = resolveId.call(context, "astro-fontkit/local");
    const googleId = resolveId.call(context, "astro/font/google");

    expect(localId).toBe("\0astro-fontkit/local");
    expect(googleId).toBe("\0astro-fontkit/google");

    const localModule = await load.call(context, localId!);
    const googleModule = await load.call(context, googleId!);

    expect(localModule).toContain('"outDir":"/project/dist"');
    expect(localModule).toContain('export { default } from "/pkg/dist/local.js";');
    expect(googleModule).toContain('export * from "/pkg/dist/google.js";');
  });

  it("loads client-safe stubs for virtual font modules in browser builds", async () => {
    const plugin = astroFontVitePlugin({
      localModulePath: "/pkg/dist/local.js",
      googleModulePath: "/pkg/dist/google.js",
      getRuntimeConfig: () => ({ mode: "build" }),
    });
    const context = {} as never;
    const resolveId = plugin.resolveId as unknown as (this: never, id: string) => string | undefined;
    const load = plugin.load as unknown as (
      this: never,
      id: string,
      options?: { ssr?: boolean },
    ) => string | undefined;

    const googleId = resolveId.call(context, "astro/font/google");
    const googleModule = await load.call(context, googleId!, { ssr: false });

    expect(googleModule).toContain("astro/font/google can only be called");
    expect(googleModule).toContain("export function createGoogleFont");
    expect(googleModule).toContain("export const Inter");
    expect(googleModule).not.toContain("/pkg/dist/google.js");
  });
});
