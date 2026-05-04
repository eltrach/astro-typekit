import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("Astro integration", () => {
  it("builds Astro pages using astro/font/local with isolated emitted font assets", async () => {
    await execFileAsync("npm", ["run", "build"], { cwd: root });

    const fixture = await mkdtemp(join(tmpdir(), "astro-typekit-fixture-"));

    try {
      const srcDir = join(fixture, "src", "pages");
      const fontsDir = join(srcDir, "fonts");

      await mkdir(fontsDir, { recursive: true });
      await symlink(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
      await writeFile(join(fontsDir, "Brand.woff2"), new Uint8Array(8192).fill(1));
      await writeFile(join(fontsDir, "Alt.woff2"), new Uint8Array(8192).fill(2));
      await writeFile(
        join(fixture, "astro.config.mjs"),
        [
          `import font from ${JSON.stringify(pathToFileURL(join(root, "dist", "index.js")).href)};`,
          'export default { integrations: [font()] };',
        ].join("\n"),
      );
      await writeFile(
        join(srcDir, "index.astro"),
        [
          "---",
          'import localFont from "astro/font/local";',
          'const brand = localFont({ src: "./fonts/Brand.woff2", weight: "400", variable: "--font-brand" });',
          "---",
          '<main class={brand.className}>Production font</main>',
        ].join("\n"),
      );
      await writeFile(
        join(srcDir, "about.astro"),
        [
          "---",
          'import localFont from "astro/font/local";',
          'const alt = localFont({ src: "./fonts/Alt.woff2", weight: "700", variable: "--font-alt" });',
          "---",
          '<main class={alt.className}>About font</main>',
        ].join("\n"),
      );

      await execFileAsync(resolve(root, "node_modules", ".bin", "astro"), ["build"], {
        cwd: fixture,
        env: {
          ...process.env,
          NODE_ENV: "production",
        },
      });

      const htmlPath = join(fixture, "dist", "index.html");
      const aboutHtmlPath = join(fixture, "dist", "about", "index.html");
      const html = await readFile(htmlPath, "utf8");
      const aboutHtml = await readFile(aboutHtmlPath, "utf8");

      expect(html).toContain("data-astro-typekit");
      expect(html).toContain("rel=\"preload\"");
      expect(html).toMatch(/\/_astro\/Brand\.[\w-]+\.woff2/);
      expect(html).toContain("--font-brand");
      expect(html).not.toContain("--font-alt");
      expect(html).not.toContain("Alt.");

      expect(aboutHtml).toContain("data-astro-typekit");
      expect(aboutHtml).toMatch(/\/_astro\/Alt\.[\w-]+\.woff2/);
      expect(aboutHtml).toContain("--font-alt");
      expect(aboutHtml).not.toContain("--font-brand");
      expect(aboutHtml).not.toContain("Brand.");

      expect(dirname(htmlPath)).toBe(join(fixture, "dist"));
    } finally {
      await rm(fixture, { force: true, recursive: true });
    }
  }, 60_000);
});
