import type { Plugin } from "vite";
import type { FontRuntimeConfig } from "./runtime/config.js";

const LOCAL_FONT_IMPORT_RE = /from\s+["'](?:astro\/font\/local|astro-fontkit\/local)["']/;
const FONT_SOURCE_RE =
  /(\b(?:src|path)\s*:\s*)(["'])(\.{1,2}\/[^"']+\.(?:woff2?|ttf|otf)(?:\?[^"']*)?)\2/g;
const VIRTUAL_LOCAL_ID = "\0astro-fontkit/local";
const VIRTUAL_GOOGLE_ID = "\0astro-fontkit/google";
const GOOGLE_FONT_EXPORTS = [
  "Inter",
  "Roboto",
  "Open_Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Source_Sans_3",
  "Merriweather",
  "Playfair_Display",
  "Nunito",
  "Raleway",
  "Work_Sans",
  "Roboto_Condensed",
  "Roboto_Mono",
  "Noto_Sans",
  "Noto_Serif",
  "Oswald",
  "Ubuntu",
  "Rubik",
  "PT_Sans",
  "PT_Serif",
  "Mulish",
  "Fira_Sans",
  "DM_Sans",
  "DM_Serif_Display",
  "Libre_Franklin",
  "Manrope",
  "Quicksand",
  "Inconsolata",
  "IBM_Plex_Sans",
  "IBM_Plex_Serif",
  "IBM_Plex_Mono",
  "Space_Grotesk",
  "Space_Mono",
  "Bebas_Neue",
  "Crimson_Text",
  "Cormorant_Garamond",
  "Libre_Baskerville",
  "Karla",
  "Barlow",
  "Archivo",
  "Arvo",
  "Cabin",
  "Josefin_Sans",
  "Titillium_Web",
  "Heebo",
  "Kanit",
  "Exo_2",
  "Lexend",
  "Outfit",
  "Plus_Jakarta_Sans",
  "Red_Hat_Display",
];

function fontAssetSpecifier(specifier: string): string {
  return specifier.includes("?") ? `${specifier}&url` : `${specifier}?url`;
}

function insertImports(code: string, imports: string[], id: string): string {
  if (imports.length === 0) {
    return code;
  }

  const importBlock = `${imports.join("\n")}\n`;

  if (id.endsWith(".astro") && code.startsWith("---")) {
    const frontmatterStart = code.indexOf("\n");
    if (frontmatterStart !== -1) {
      return `${code.slice(0, frontmatterStart + 1)}${importBlock}${code.slice(
        frontmatterStart + 1,
      )}`;
    }
  }

  return `${importBlock}${code}`;
}

export function transformLocalFontAssets(code: string, id: string): string | undefined {
  if (!LOCAL_FONT_IMPORT_RE.test(code)) {
    return undefined;
  }

  const imports: string[] = [];
  let assetIndex = 0;
  const transformed = code.replace(FONT_SOURCE_RE, (match, prefix: string, _quote: string, source: string) => {
    const variableName = `__astroFontAsset${assetIndex}`;
    assetIndex += 1;
    imports.push(`import ${variableName} from ${JSON.stringify(fontAssetSpecifier(source))};`);
    return `${prefix}${variableName}`;
  });

  if (imports.length === 0) {
    return undefined;
  }

  return insertImports(transformed, imports, id);
}

export interface AstroFontVitePluginOptions {
  localModulePath: string;
  googleModulePath: string;
  includePackageAliases?: boolean | undefined;
  getRuntimeConfig: () => FontRuntimeConfig;
}

function runtimeConfigCode(config: FontRuntimeConfig): string {
  return `globalThis[Symbol.for("astro-fontkit.runtime-config")] = ${JSON.stringify(config)};`;
}

function clientFontModuleCode(kind: "google" | "local"): string {
  const message =
    kind === "google"
      ? "astro/font/google can only be called during Astro server rendering. Move the import into a .astro file, endpoint, or server-only module."
      : "astro/font/local can only be called during Astro server rendering. Move the import into a .astro file, endpoint, or server-only module.";

  if (kind === "local") {
    return [
      `const message = ${JSON.stringify(message)};`,
      "export default function localFont(){ throw new Error(message); }",
    ].join("\n");
  }

  return [
    `const message = ${JSON.stringify(message)};`,
    "export function createGoogleFont(){ return function googleFont(){ throw new Error(message); }; }",
    ...GOOGLE_FONT_EXPORTS.map((name) => `export const ${name} = createGoogleFont(${JSON.stringify(name.replace(/_/g, " "))});`),
  ].join("\n");
}

export function astroFontVitePlugin(options: AstroFontVitePluginOptions): Plugin {
  const localIds = new Set(["astro/font/local"]);
  const googleIds = new Set(["astro/font/google"]);

  if (options.includePackageAliases) {
    localIds.add("astro-fontkit/local");
    googleIds.add("astro-fontkit/google");
  }

  return {
    name: "astro-fontkit:local-assets",
    enforce: "pre",
    resolveId(id) {
      if (localIds.has(id)) {
        return VIRTUAL_LOCAL_ID;
      }

      if (googleIds.has(id)) {
        return VIRTUAL_GOOGLE_ID;
      }
    },
    load(id, loadOptions) {
      if (loadOptions?.ssr === false) {
        if (id === VIRTUAL_LOCAL_ID) {
          return clientFontModuleCode("local");
        }

        if (id === VIRTUAL_GOOGLE_ID) {
          return clientFontModuleCode("google");
        }
      }

      if (id === VIRTUAL_LOCAL_ID) {
        return [
          runtimeConfigCode(options.getRuntimeConfig()),
          `export { default } from ${JSON.stringify(options.localModulePath)};`,
          `export * from ${JSON.stringify(options.localModulePath)};`,
        ].join("\n");
      }

      if (id === VIRTUAL_GOOGLE_ID) {
        return [
          runtimeConfigCode(options.getRuntimeConfig()),
          `export * from ${JSON.stringify(options.googleModulePath)};`,
        ].join("\n");
      }
    },
    transform(code, id) {
      if (!/\.(?:astro|[cm]?[jt]sx?)($|\?)/.test(id)) {
        return;
      }

      const transformed = transformLocalFontAssets(code, id.split("?")[0] ?? id);
      if (!transformed) {
        return;
      }

      return {
        code: transformed,
        map: null,
      };
    },
  };
}
