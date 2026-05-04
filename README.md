<h1 align="center">astro-fontkit</h1>

<p align="center">
  Astro-native font loading for Google Fonts and local font files.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/astro-fontkit"><img alt="npm" src="https://img.shields.io/npm/v/astro-fontkit?style=flat-square"></a>
  <img alt="Astro" src="https://img.shields.io/badge/Astro-%3E%3D5.0.0-ff5d01?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-111827?style=flat-square">
</p>

`astro-fontkit` gives Astro projects a small, typed font API at `astro/font/google` and
`astro/font/local`. Add the integration once, import fonts directly inside your
Astro components, and let the middleware inject the generated `@font-face` rules
into the rendered page.

## Features

- Astro integration with first-class `astro.config.ts` setup
- `astro/font/google` helpers for popular Google Fonts
- `astro/font/local` for one file, many weights, or variable font families
- Generated class names and optional CSS variable classes
- Local font files emitted through Vite/Astro as hashed assets when possible
- Automatic font preloads for emitted local font files
- Google Font CSS cached in `node_modules/.cache/astro-fontkit`
- Google font loading strategies: keep fonts hosted by Google or inline them
- Optional selector rules for app-wide font application
- Type declarations injected automatically for Astro projects

## Install

```sh
npm install astro-fontkit
```

## Add The Integration

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import font from "astro-fontkit";

export default defineConfig({
  integrations: [font()],
});
```

The integration registers Astro middleware, configures virtual font modules for
Vite, rewrites static local font paths to asset imports, and injects TypeScript
declarations for both import paths.

## Use A Google Font

```astro
---
import { Inter } from "astro/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  strategy: "external",
  variable: "--font-inter",
  fallback: ["system-ui", "sans-serif"],
});
---

<html lang="en" class={inter.variable}>
  <body class={inter.className}>
    <h1>Astro pages with crisp, optimized type.</h1>
  </body>
</html>
```

## Use A Local Font

```astro
---
import localFont from "astro/font/local";

const brand = localFont({
  src: [
    { path: "../fonts/Brand-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Brand-Bold.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-brand",
  fallback: ["system-ui", "sans-serif"],
});
---

<main class={`${brand.className} ${brand.variable}`}>
  <h1>Your Astro site, in your own typeface.</h1>
</main>
```

Static relative local paths in Astro, TypeScript, and JavaScript files are
rewritten to Vite `?url` imports so Astro can fingerprint and emit the files.
Public URLs such as `/fonts/Brand.woff2` are kept as URLs. During production
builds, any local file that cannot be rewritten is copied into Astro's asset
directory with a content hash as a fallback.

## API

### `astro/font/google`

Exports named Google font helpers such as:

```ts
import {
  Inter,
  Lato,
  Merriweather,
  Montserrat,
  Open_Sans,
  Playfair_Display,
  Poppins,
  Raleway,
  Roboto,
  Source_Sans_3,
  Work_Sans,
  createGoogleFont,
} from "astro/font/google";
```

```ts
const heading = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-heading",
  fallback: ["Georgia", "serif"],
});
```

Need a Google Font helper that is not exported yet? Create one by family name:

```ts
import { createGoogleFont } from "astro/font/google";

const DM_Sans = createGoogleFont("DM Sans");

const body = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});
```

By default, Google font CSS keeps its `fonts.gstatic.com` URLs intact, so the
browser loads font files from Google at runtime. If you want a fully inlined
response instead, opt in per font:

```astro
---
import { Inter } from "astro/font/google";

const inter = Inter({
  weight: ["400", "700"],
  strategy: "inline",
});
---
```

To apply a font globally, pass one or more selectors. The generated class names
are still returned, but the middleware also emits selector rules:

```astro
---
import { createGoogleFont } from "astro/font/google";

const Cairo = createGoogleFont("Cairo");

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cairo",
  fallback: ["Tahoma", "Arial", "sans-serif"],
  variableSelector: ":root",
  selector: ["html[lang='ar']", "body[dir='rtl']"],
});
---
```

Use `variableSelector` when you only want to expose the CSS variable, such as on
`:root`. Use `selector` when that selector should actually receive the
`font-family` declaration too.

### `astro/font/local`

The default export accepts a single source or an array of sources:

```ts
import localFont from "astro/font/local";

const mono = localFont({
  src: "../fonts/MonoVariable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-mono",
});
```

## Returned Object

Both font modules return the same shape:

```ts
type AstroFont = {
  className: string;
  variable?: string;
  family: string;
  style: {
    fontFamily: string;
    fontStyle?: string;
    fontWeight?: string;
  };
};
```

Use `className` directly on Astro elements, apply `variable` to expose a CSS
custom property, read `family` for a resolved `font-family` value, or read
`style` when you need inline style values.

## How It Works

`astro-fontkit` collects font usage while Astro renders, downloads and caches
Google Font CSS when needed, optionally inlines Google font files, emits local
font files as hashed assets, injects preload links for emitted local fonts, and
appends the final CSS to the HTML response. Your components stay clean, and the
generated font rules travel with the page Astro builds.
