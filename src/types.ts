export type FontDisplay = "auto" | "block" | "swap" | "fallback" | "optional";
export type FontStyle = "normal" | "italic";
export type GoogleFontStrategy = "external" | "inline";
export type FontWeight =
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900"
  | `${number}`;

export interface AstroFont {
  className: string;
  variable?: string;
  style: {
    fontFamily: string;
    fontStyle?: string;
    fontWeight?: string;
  };
  /**
   * Fully resolved CSS font-family value, useful for global CSS variables.
   */
  family: string;
}

export interface BaseFontOptions {
  display?: FontDisplay;
  fallback?: string[];
  preload?: boolean;
  /**
   * Extra selectors that should receive the generated font declarations.
   * This is useful for app-wide font application, for example:
   * selector: "body[dir='rtl']"
   */
  selector?: string | string[];
  /**
   * Extra selectors that should receive only the generated CSS variable.
   * This is useful for exposing variables on :root without applying the font
   * family to the entire document.
   */
  variableSelector?: string | string[];
  variable?: string;
  declarations?: Array<{
    prop: string;
    value: string;
  }>;
}

export interface GoogleFontOptions extends BaseFontOptions {
  /**
   * external keeps Google font file URLs in the generated CSS, so browsers load
   * font files from fonts.gstatic.com. inline embeds those files as data URLs.
   *
   * @default "external"
   */
  strategy?: GoogleFontStrategy;
  subsets?: string[];
  weight?: FontWeight | FontWeight[];
  style?: FontStyle | FontStyle[];
  axes?: string[];
}

export interface LocalFontSource {
  path: string;
  weight?: FontWeight | string | undefined;
  style?: FontStyle | string | undefined;
}

export interface LocalFontOptions extends BaseFontOptions {
  src: string | LocalFontSource | LocalFontSource[];
  weight?: FontWeight | string;
  style?: FontStyle | string;
  /**
   * Internal fallback used when source code cannot be rewritten to Vite asset
   * imports. Public for emitted declarations only; user code should not set it.
   */
  _base?: string;
}

export interface CreateFontResultOptions {
  className: string;
  variableClassName?: string | undefined;
  family: string;
  fallback?: string[] | undefined;
  weight?: string | undefined;
  style?: string | undefined;
  variable?: string | undefined;
  selector?: string | string[] | undefined;
  variableSelector?: string | string[] | undefined;
}
