import { runWithFontAssets } from "./runtime/registry.js";

const STYLE_MARKER = "<!--astro-fontkit-->";

function isHtmlResponse(response: Response): boolean {
  return response.headers.get("content-type")?.includes("text/html") ?? false;
}

function injectStyle(html: string, css: string): string {
  if (!css) {
    return html;
  }

  if (html.includes("data-astro-fontkit")) {
    return html;
  }

  const style = `<style data-astro-fontkit>${STYLE_MARKER}${css}</style>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${style}</head>`);
  }

  return `${style}${html}`;
}

function injectPreloads(html: string, preload: string[]): string {
  if (preload.length === 0) {
    return html;
  }

  const links = preload
    .filter((href) => !html.includes(`href="${escapeHtmlAttribute(href)}"`))
    .map((href) => `<link rel="preload" as="font" href="${escapeHtmlAttribute(href)}" crossorigin>`)
    .join("");

  if (!links) {
    return html;
  }

  if (html.includes("</head>")) {
    return html.replace("</head>", `${links}</head>`);
  }

  return `${links}${html}`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function onRequest(_context: unknown, next: () => Promise<Response>): Promise<Response> {
  const { result: response, css, preload } = await runWithFontAssets(next);

  if (!css || !isHtmlResponse(response)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  const html = injectStyle(injectPreloads(await response.text(), preload), css);

  return new Response(html, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
