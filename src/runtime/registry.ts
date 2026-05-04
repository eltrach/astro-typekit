import { AsyncLocalStorage } from "node:async_hooks";

export interface FontCssEntry {
  css: string | Promise<string>;
  preload?: string[] | Promise<string[]> | undefined;
}

type CssTask = string | Promise<string>;
type FontRegistry = Map<string, FontCssEntry>;

const globalCssEntries: FontRegistry = new Map();
const requestStorage = new AsyncLocalStorage<FontRegistry>();

function currentRegistry(): FontRegistry {
  return requestStorage.getStore() ?? globalCssEntries;
}

export function registerFontCss(id: string, css: CssTask): void {
  currentRegistry().set(id, { css });
}

export function registerFont(id: string, entry: FontCssEntry): void {
  currentRegistry().set(id, entry);
}

export async function collectFontAssets(
  registry = currentRegistry(),
): Promise<{ css: string; preload: string[] }> {
  const entries = Array.from(registry.values());
  const [css, preloadLists] = await Promise.all([
    Promise.all(entries.map((entry) => entry.css)),
    Promise.all(entries.map((entry) => entry.preload ?? [])),
  ]);

  registry.clear();

  return {
    css: css.filter(Boolean).join("\n"),
    preload: Array.from(new Set(preloadLists.flat().filter(Boolean))),
  };
}

export async function collectFontCss(registry = currentRegistry()): Promise<string> {
  return (await collectFontAssets(registry)).css;
}

export async function runWithFontRegistry<T>(
  callback: () => Promise<T>,
): Promise<{ result: T; css: string }> {
  const registry: FontRegistry = new Map();
  const result = await requestStorage.run(registry, callback);
  const { css } = await collectFontAssets(registry);

  return { result, css };
}

export async function runWithFontAssets<T>(
  callback: () => Promise<T>,
): Promise<{ result: T; css: string; preload: string[] }> {
  const registry: FontRegistry = new Map();
  const result = await requestStorage.run(registry, callback);
  const assets = await collectFontAssets(registry);

  return { result, ...assets };
}

export function clearFontCss(): void {
  currentRegistry().clear();
}
