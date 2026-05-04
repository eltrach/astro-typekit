import type { AstroFont, CreateFontResultOptions } from "../types.js";

export function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function cssString(value: string): string {
  return `"${cssEscape(value)}"`;
}

export function fontFamilyValue(family: string, fallback: string[] = []): string {
  return [cssString(family), ...fallback].join(", ");
}

export function createFontResult(options: CreateFontResultOptions): AstroFont {
  const result: AstroFont = {
    className: options.className,
    family: fontFamilyValue(options.family, options.fallback),
    style: {
      fontFamily: fontFamilyValue(options.family, options.fallback),
    },
  };

  if (options.style) {
    result.style.fontStyle = options.style;
  }

  if (options.weight) {
    result.style.fontWeight = options.weight;
  }

  if (options.variableClassName) {
    result.variable = options.variableClassName;
  }

  return result;
}

export function createClassRules(options: {
  className: string;
  variableClassName?: string | undefined;
  family: string;
  fallback?: string[] | undefined;
  weight?: string | undefined;
  style?: string | undefined;
  variable?: string | undefined;
  selector?: string | string[] | undefined;
  variableSelector?: string | string[] | undefined;
  declarations?: Array<{ prop: string; value: string }> | undefined;
}): string {
  const declarations = [
    `font-family: ${fontFamilyValue(options.family, options.fallback)};`,
  ];

  if (options.weight) {
    declarations.push(`font-weight: ${options.weight};`);
  }

  if (options.style) {
    declarations.push(`font-style: ${options.style};`);
  }

  for (const declaration of options.declarations ?? []) {
    declarations.push(`${declaration.prop}: ${declaration.value};`);
  }

  const rules = [`.${options.className}{${declarations.join("")}}`];
  const selectors =
    typeof options.selector === "string"
      ? [options.selector]
      : options.selector ?? [];

  for (const selector of selectors) {
    const selectorDeclarations = [...declarations];

    if (options.variable) {
      selectorDeclarations.push(
        `${options.variable}: ${fontFamilyValue(options.family, options.fallback)};`,
      );
    }

    rules.push(`${selector}{${selectorDeclarations.join("")}}`);
  }

  const variableSelectors =
    typeof options.variableSelector === "string"
      ? [options.variableSelector]
      : options.variableSelector ?? [];

  if (options.variable) {
    for (const selector of variableSelectors) {
      rules.push(
        `${selector}{${options.variable}: ${fontFamilyValue(options.family, options.fallback)};}`,
      );
    }
  }

  if (options.variable && options.variableClassName) {
    rules.push(
      `.${options.variableClassName}{${options.variable}: ${fontFamilyValue(
        options.family,
        options.fallback,
      )};}`,
    );
  }

  return rules.join("\n");
}
