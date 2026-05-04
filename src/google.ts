import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClassRules, createFontResult } from "./runtime/css.js";
import { hashString } from "./runtime/hash.js";
import { registerFontCss } from "./runtime/registry.js";
import type {
  AstroFont,
  FontStyle,
  FontWeight,
  GoogleFontOptions,
  GoogleFontStrategy,
} from "./types.js";

const GOOGLE_CSS_ENDPOINT = "https://fonts.googleapis.com/css2";
const WOFF2_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36";

const googleCssCache = new Map<string, Promise<string>>();

function cacheDir(): string {
  return process.env.ASTRO_FONT_CACHE_DIR ?? resolve(process.cwd(), "node_modules", ".cache", "astro-typekit");
}

async function readCachedCss(cacheKey: string): Promise<string | undefined> {
  try {
    return await readFile(resolve(cacheDir(), `${cacheKey}.css`), "utf8");
  } catch {
    return undefined;
  }
}

async function writeCachedCss(cacheKey: string, css: string): Promise<void> {
  await mkdir(cacheDir(), { recursive: true });
  await writeFile(resolve(cacheDir(), `${cacheKey}.css`), css);
}

function arrayify<T>(value: T | T[] | undefined, fallback: T[]): T[] {
  if (value === undefined) {
    return fallback;
  }

  return Array.isArray(value) ? value : [value];
}

function sortWeights(weights: FontWeight[]): FontWeight[] {
  return [...weights].sort((left, right) => Number(left) - Number(right));
}

function sortStyles(styles: FontStyle[]): FontStyle[] {
  return [...styles].sort((left, right) => {
    if (left === right) {
      return 0;
    }

    return left === "normal" ? -1 : 1;
  });
}

function toCssFamilyName(exportName: string): string {
  return exportName.replace(/_/g, " ");
}

function createFamilyQuery(family: string, options: GoogleFontOptions): string {
  const weights = sortWeights(arrayify<FontWeight>(options.weight, ["400"]));
  const styles = sortStyles(arrayify<FontStyle>(options.style, ["normal"]));
  const familyName = family.replace(/\s+/g, "+");

  if (styles.length === 1 && styles[0] === "normal") {
    if (weights.length === 1 && weights[0] === "400" && !options.axes?.length) {
      return `family=${familyName}`;
    }

    const axes = ["wght", ...(options.axes ?? [])].sort();
    return `family=${familyName}:${axes.join(",")}@${weights.join(";")}`;
  }

  const tuples = styles.flatMap((style) =>
    weights.map((weight) => `${style === "italic" ? 1 : 0},${weight}`),
  );
  const axes = ["ital", "wght", ...(options.axes ?? [])].sort();

  return `family=${familyName}:${axes.join(",")}@${tuples.join(";")}`;
}

function createGoogleCssUrl(family: string, options: GoogleFontOptions): string {
  const params = [
    createFamilyQuery(family, options),
    `display=${options.display ?? "swap"}`,
  ];

  for (const subset of options.subsets ?? []) {
    params.push(`subset=${encodeURIComponent(subset)}`);
  }

  return `${GOOGLE_CSS_ENDPOINT}?${params.join("&")}`;
}

function inferMimeType(url: string): string {
  if (url.includes(".woff2")) {
    return "font/woff2";
  }

  if (url.includes(".woff")) {
    return "font/woff";
  }

  if (url.includes(".ttf")) {
    return "font/ttf";
  }

  return "application/octet-stream";
}

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": WOFF2_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download Google font file: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${inferMimeType(url)};base64,${buffer.toString("base64")}`;
}

async function inlineGoogleFontUrls(css: string): Promise<string> {
  const fontUrls = Array.from(
    new Set(
      Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g), (match) => match[1])
        .filter((url): url is string => Boolean(url)),
    ),
  );

  const replacements = await Promise.all(
    fontUrls.map(async (fontUrl) => [`url(${fontUrl})`, `url(${await toDataUrl(fontUrl)})`] as const),
  );

  return replacements.reduce(
    (nextCss, [match, replacement]) => nextCss.replaceAll(match, replacement),
    css,
  );
}

async function fetchGoogleCss(url: string, strategy: GoogleFontStrategy): Promise<string> {
  const cacheKey = hashString(`google-css:${strategy}:${url}`);
  const cached = googleCssCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const cssPromise = (async () => {
    const cachedCss = await readCachedCss(cacheKey);

    if (cachedCss) {
      return cachedCss;
    }

    const response = await fetch(url, {
      headers: {
        "user-agent": WOFF2_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download Google font CSS: ${response.status} ${response.statusText}`);
    }

    const css = await response.text();
    const outputCss = strategy === "inline" ? await inlineGoogleFontUrls(css) : css;

    await writeCachedCss(cacheKey, outputCss);

    return outputCss;
  })();

  googleCssCache.set(cacheKey, cssPromise);
  return cssPromise;
}

export function createGoogleFont(exportName: string) {
  return function googleFont(options: GoogleFontOptions = {}): AstroFont {
    const family = toCssFamilyName(exportName);
    const strategy = options.strategy ?? "external";
    const cssUrl = createGoogleCssUrl(family, options);
    const id = hashString(`google:${strategy}:${cssUrl}:${JSON.stringify(options)}`);
    const className = `__astro_font_${id}`;
    const variableClassName = options.variable ? `__astro_font_variable_${id}` : undefined;
    const weights = arrayify<FontWeight>(options.weight, ["400"]);
    const styles = arrayify<FontStyle>(options.style, ["normal"]);
    const normalizedWeight = weights.length === 1 ? weights[0] : undefined;
    const normalizedStyle = styles.length === 1 ? styles[0] : undefined;

    registerFontCss(
      id,
      fetchGoogleCss(cssUrl, strategy).then(
        (fontFaceCss) =>
          `${fontFaceCss}\n${createClassRules({
            className,
            variableClassName,
            family,
            fallback: options.fallback,
            weight: normalizedWeight,
            style: normalizedStyle,
            variable: options.variable,
            selector: options.selector,
            variableSelector: options.variableSelector,
            declarations: options.declarations,
          })}`,
      ),
    );

    return createFontResult({
      className,
      variableClassName,
      family,
      fallback: options.fallback,
      weight: normalizedWeight,
      style: normalizedStyle,
      variable: options.variable,
      selector: options.selector,
      variableSelector: options.variableSelector,
    });
  };
}

export const Inter = createGoogleFont("Inter");
export const Roboto = createGoogleFont("Roboto");
export const Open_Sans = createGoogleFont("Open Sans");
export const Lato = createGoogleFont("Lato");
export const Montserrat = createGoogleFont("Montserrat");
export const Poppins = createGoogleFont("Poppins");
export const Source_Sans_3 = createGoogleFont("Source Sans 3");
export const Merriweather = createGoogleFont("Merriweather");
export const Playfair_Display = createGoogleFont("Playfair Display");
export const Nunito = createGoogleFont("Nunito");
export const Raleway = createGoogleFont("Raleway");
export const Work_Sans = createGoogleFont("Work Sans");
export const Roboto_Condensed = createGoogleFont("Roboto Condensed");
export const Roboto_Mono = createGoogleFont("Roboto Mono");
export const Noto_Sans = createGoogleFont("Noto Sans");
export const Noto_Serif = createGoogleFont("Noto Serif");
export const Oswald = createGoogleFont("Oswald");
export const Ubuntu = createGoogleFont("Ubuntu");
export const Rubik = createGoogleFont("Rubik");
export const PT_Sans = createGoogleFont("PT Sans");
export const PT_Serif = createGoogleFont("PT Serif");
export const Mulish = createGoogleFont("Mulish");
export const Fira_Sans = createGoogleFont("Fira Sans");
export const DM_Sans = createGoogleFont("DM Sans");
export const DM_Serif_Display = createGoogleFont("DM Serif Display");
export const Libre_Franklin = createGoogleFont("Libre Franklin");
export const Manrope = createGoogleFont("Manrope");
export const Quicksand = createGoogleFont("Quicksand");
export const Inconsolata = createGoogleFont("Inconsolata");
export const IBM_Plex_Sans = createGoogleFont("IBM Plex Sans");
export const IBM_Plex_Serif = createGoogleFont("IBM Plex Serif");
export const IBM_Plex_Mono = createGoogleFont("IBM Plex Mono");
export const Space_Grotesk = createGoogleFont("Space Grotesk");
export const Space_Mono = createGoogleFont("Space Mono");
export const Bebas_Neue = createGoogleFont("Bebas Neue");
export const Crimson_Text = createGoogleFont("Crimson Text");
export const Cormorant_Garamond = createGoogleFont("Cormorant Garamond");
export const Libre_Baskerville = createGoogleFont("Libre Baskerville");
export const Karla = createGoogleFont("Karla");
export const Barlow = createGoogleFont("Barlow");
export const Archivo = createGoogleFont("Archivo");
export const Arvo = createGoogleFont("Arvo");
export const Cabin = createGoogleFont("Cabin");
export const Josefin_Sans = createGoogleFont("Josefin Sans");
export const Titillium_Web = createGoogleFont("Titillium Web");
export const Heebo = createGoogleFont("Heebo");
export const Kanit = createGoogleFont("Kanit");
export const Exo_2 = createGoogleFont("Exo 2");
export const Lexend = createGoogleFont("Lexend");
export const Outfit = createGoogleFont("Outfit");
export const Plus_Jakarta_Sans = createGoogleFont("Plus Jakarta Sans");
export const Red_Hat_Display = createGoogleFont("Red Hat Display");
export const Red_Hat_Text = createGoogleFont("Red Hat Text");
