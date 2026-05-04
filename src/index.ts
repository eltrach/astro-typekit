import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AstroIntegration } from "astro";
import { setFontRuntimeConfig } from "./runtime/config.js";
import { astroFontVitePlugin } from "./vite-plugin.js";

export interface AstroFontIntegrationOptions {
  /**
   * When true, also aliases the package's own subpaths. This is mostly useful
   * for examples and tests.
   */
  includePackageAliases?: boolean;
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function distUrl(file: string): URL {
  return pathToFileURL(resolve(packageRoot, "dist", file));
}

function distPath(file: string): string {
  return resolve(packageRoot, "dist", file);
}

function typeDeclarations(): string {
  return [
    'declare module "astro/font/google" {',
    '  export * from "astro-typekit/google";',
    "}",
    "",
    'declare module "astro/font/local" {',
    '  export { default } from "astro-typekit/local";',
    '  export * from "astro-typekit/local";',
    "}",
    "",
  ].join("\n");
}

export default function astroFont(options: AstroFontIntegrationOptions = {}): AstroIntegration {
  let activeCommand: "dev" | "build" | "preview" | "sync" = "dev";
  let currentOutDir: string | undefined;
  let currentAssetsDir: string | undefined;
  let currentBase: string | undefined;

  return {
    name: "astro-typekit",
    hooks: {
      "astro:config:setup": ({ addMiddleware, command, updateConfig }) => {
        activeCommand = command;
        setFontRuntimeConfig({ mode: command });

        updateConfig({
          vite: {
            plugins: [
              astroFontVitePlugin({
                localModulePath: distPath("local.js"),
                googleModulePath: distPath("google.js"),
                includePackageAliases: options.includePackageAliases,
                getRuntimeConfig: () => ({
                  mode: activeCommand,
                  outDir: currentOutDir,
                  assetsDir: currentAssetsDir,
                  base: currentBase,
                }),
              }),
            ],
          },
        });

        addMiddleware({
          entrypoint: distUrl("middleware.js"),
          order: "post",
        });
      },
      "astro:config:done": ({ config, injectTypes }) => {
        currentOutDir = fileURLToPath(config.outDir);
        currentAssetsDir = config.build.assets;
        currentBase = config.base;

        setFontRuntimeConfig({
          mode: activeCommand,
          outDir: currentOutDir,
          assetsDir: currentAssetsDir,
          base: currentBase,
        });

        injectTypes({
          filename: "font-modules.d.ts",
          content: typeDeclarations(),
        });
      },
    },
  };
}

export type { AstroFont, GoogleFontOptions, LocalFontOptions } from "./types.js";
