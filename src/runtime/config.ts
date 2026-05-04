export interface FontRuntimeConfig {
  mode: "dev" | "build" | "preview" | "sync";
  outDir?: string | undefined;
  assetsDir?: string | undefined;
  base?: string | undefined;
}

const CONFIG_SYMBOL = Symbol.for("astro-typekit.runtime-config");

type GlobalWithFontConfig = typeof globalThis & {
  [CONFIG_SYMBOL]?: FontRuntimeConfig;
  process?: {
    cwd?: () => string;
    env?: Record<string, string | undefined>;
  };
};

export function setFontRuntimeConfig(config: FontRuntimeConfig): void {
  (globalThis as GlobalWithFontConfig)[CONFIG_SYMBOL] = config;

  process.env.ASTRO_FONT_MODE = config.mode;

  if (config.outDir) {
    process.env.ASTRO_FONT_OUT_DIR = config.outDir;
  }

  if (config.assetsDir) {
    process.env.ASTRO_FONT_ASSETS_DIR = config.assetsDir;
  }

  if (config.base) {
    process.env.ASTRO_FONT_BASE = config.base;
  }
}

function readEnv(name: string): string | undefined {
  return (globalThis as GlobalWithFontConfig).process?.env?.[name];
}

function cwd(): string {
  return (globalThis as GlobalWithFontConfig).process?.cwd?.() ?? process.cwd();
}

function isViteProduction(): boolean {
  return Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);
}

export function getFontRuntimeConfig(): FontRuntimeConfig {
  const nodeEnv = readEnv("NODE_ENV");
  const isProduction = nodeEnv === "production" || isViteProduction();
  const fallbackMode = readEnv("ASTRO_FONT_MODE") ?? (isProduction ? "build" : "dev");
  const stored = (globalThis as GlobalWithFontConfig)[CONFIG_SYMBOL];

  if (stored) {
    const mode = stored.mode !== "build" && isProduction ? "build" : stored.mode;

    return {
      mode,
      outDir:
        stored.outDir ??
        readEnv("ASTRO_FONT_OUT_DIR") ??
        (mode === "build" ? `${cwd()}/dist` : undefined),
      assetsDir: stored.assetsDir ?? readEnv("ASTRO_FONT_ASSETS_DIR") ?? "_astro",
      base: stored.base ?? readEnv("ASTRO_FONT_BASE"),
    };
  }

  return {
    mode: fallbackMode as FontRuntimeConfig["mode"],
    outDir:
      readEnv("ASTRO_FONT_OUT_DIR") ?? (fallbackMode === "build" ? `${cwd()}/dist` : undefined),
    assetsDir: readEnv("ASTRO_FONT_ASSETS_DIR") ?? "_astro",
    base: readEnv("ASTRO_FONT_BASE"),
  };
}
