import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClassRules, createFontResult, cssString } from "./runtime/css.js";
import { getFontRuntimeConfig } from "./runtime/config.js";
import { hashString } from "./runtime/hash.js";
import { registerFont } from "./runtime/registry.js";
import type { AstroFont, LocalFontOptions, LocalFontSource } from "./types.js";

function normalizeSources(options: LocalFontOptions): LocalFontSource[] {
  const sources = Array.isArray(options.src) ? options.src : [options.src];

  return sources.map((source) => {
    if (typeof source === "string") {
      return {
        path: source,
        weight: options.weight,
        style: options.style,
      };
    }

    return {
      ...source,
      weight: source.weight ?? options.weight,
      style: source.style ?? options.style,
    };
  });
}

function inferFormat(path: string): string | undefined {
  const extension = path.split("?")[0]?.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "ttf":
      return "truetype";
    case "otf":
      return "opentype";
    default:
      return undefined;
  }
}

function inferMimeType(path: string): string {
  const extension = path.split("?")[0]?.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    default:
      return "application/octet-stream";
  }
}

function isExternalUrl(path: string): boolean {
  return /^(https?:)?\/\//.test(path) || path.startsWith("/");
}

function joinUrl(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/{2,}/g, "/")
    .replace(":/", "://");
}

function resolveLocalPath(path: string, base: string | undefined): string {
  if (isAbsolute(path)) {
    return path;
  }

  if (base?.startsWith("file:")) {
    return resolve(fileURLToPath(new URL(".", base)), path);
  }

  return resolve(process.cwd(), path);
}

const emittedLocalFonts = new Map<string, Promise<string>>();

async function emitLocalFontAsset(path: string, base: string | undefined): Promise<string | undefined> {
  const config = getFontRuntimeConfig();

  if (config.mode !== "build" || !config.outDir) {
    return undefined;
  }

  const absolutePath = resolveLocalPath(path, base);
  const cached = emittedLocalFonts.get(absolutePath);

  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const data = await readFile(absolutePath);
    const extension = extname(absolutePath);
    const name = basename(absolutePath, extension);
    const fileName = `${name}.${hashString(data.toString("base64")).slice(0, 8)}${extension}`;
    const assetsDir = config.assetsDir ?? "_astro";
    const outputDir = join(config.outDir!, assetsDir);

    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, fileName), data);

    return joinUrl(config.base ?? "/", assetsDir, fileName);
  })();

  emittedLocalFonts.set(absolutePath, promise);
  return promise;
}

async function localPathToUrl(path: string, base: string | undefined): Promise<string> {
  if (isExternalUrl(path) || path.startsWith("data:")) {
    return path;
  }

  const emittedUrl = await emitLocalFontAsset(path, base);

  if (emittedUrl) {
    return emittedUrl;
  }

  const absolutePath = resolveLocalPath(path, base);
  const data = await readFile(absolutePath);
  return `data:${inferMimeType(path)};base64,${data.toString("base64")}`;
}

async function createFontFaceRules(
  family: string,
  sources: LocalFontSource[],
  display: string,
  base: string | undefined,
): Promise<string> {
  const rules = await Promise.all(
    sources.map(async (source) => {
      const url = await localPathToUrl(source.path, base);
      const format = inferFormat(source.path);
      const declarations = [
        `font-family: ${cssString(family)};`,
        `src: url(${cssString(url)})${format ? ` format(${cssString(format)})` : ""};`,
        `font-display: ${display};`,
      ];

      if (source.weight) {
        declarations.push(`font-weight: ${source.weight};`);
      }

      if (source.style) {
        declarations.push(`font-style: ${source.style};`);
      }

      return `@font-face{${declarations.join("")}}`;
    }),
  );

  return rules.join("\n");
}

async function createPreloadUrls(
  sources: LocalFontSource[],
  base: string | undefined,
  preload: boolean | undefined,
): Promise<string[]> {
  if (preload === false) {
    return [];
  }

  const urls = await Promise.all(
    sources.map(async (source) => {
      const url = await localPathToUrl(source.path, base);
      return url.startsWith("data:") ? undefined : url;
    }),
  );

  return urls.filter((url): url is string => Boolean(url));
}

export default function localFont(options: LocalFontOptions): AstroFont {
  const sources = normalizeSources(options);
  const id = hashString(`local:${JSON.stringify(options)}`);
  const family = `__AstroFont_${id}`;
  const className = `__astro_font_${id}`;
  const variableClassName = options.variable ? `__astro_font_variable_${id}` : undefined;
  const singleWeight = sources.length === 1 ? sources[0]?.weight : undefined;
  const singleStyle = sources.length === 1 ? sources[0]?.style : undefined;

  registerFont(id, {
    css: createFontFaceRules(family, sources, options.display ?? "swap", options._base).then(
      (fontFaceCss) =>
        `${fontFaceCss}\n${createClassRules({
          className,
          variableClassName,
          family,
          fallback: options.fallback,
          weight: singleWeight,
          style: singleStyle,
          variable: options.variable,
          selector: options.selector,
          variableSelector: options.variableSelector,
          declarations: options.declarations,
        })}`,
    ),
    preload: createPreloadUrls(sources, options._base, options.preload),
  });

  return createFontResult({
    className,
    variableClassName,
    family,
    fallback: options.fallback,
    weight: singleWeight,
    style: singleStyle,
    variable: options.variable,
    selector: options.selector,
    variableSelector: options.variableSelector,
  });
}
