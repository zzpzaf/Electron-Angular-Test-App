# Angular 'MarkShow' Markdown Service — Safe Handling of Inline `<…>` in Markdown
### 250811

**Goal:** prevent inline angle‑bracketed chunks (e.g., `<iframe>`, `<T>`, `<img>`, `</div>`) from breaking Markdown paragraphs, while still letting legitimate **block HTML** (like a video `<iframe>` on its own lines) render as HTML.

This guide explains **what the service does**, **how it works**, and documents every helper it uses. It is written for Angular + TypeScript and the [marked](https://github.com/markedjs/marked) parser.

---

## Why this service exists

CommonMark/GFM and Marked treat anything inside angle brackets in one of two ways:

- **Raw HTML** if it *resembles* an HTML tag, which can prematurely end Markdown parsing for that paragraph.
- **Autolinks** when it looks like `<https://…>` or `<mailto:…>`.

That means prose like _“use the `<iframe>` tag”_ can cause the parser to switch into HTML mode and break your text, especially when the tag is **not properly closed**.

**Design choice:** Preprocess the raw Markdown **before** Marked tokenizes it and wrap **inline** angle‑bracketed sequences with backticks (so they render as inline code). Keep block HTML on its own lines intact, so embeds still work.

You can choose between two behaviors:

- **Strict mode (recommended for prose):** backtick **any** inline `<…>` except autolinks.
- **Non‑strict mode:** allow paired inline HTML like `<strong>bold</strong>` to render; backtick only unmatched/solo tags.

---

## Installation

```bash
npm i marked dompurify
npm i -D @types/dompurify
```

---

## Full Service (drop‑in)

> Put this in `src/app/shared/markdown.service.ts` (or a similar shared location).

```ts
import { Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** HTML void elements that never have closing counterparts */
const VOID_TAGS = new Set([
  'area','base','br','col','embed','hr','img','input','link','meta',
  'param','source','track','wbr'
]);

/**
 * Preprocess the raw markdown string and wrap inline angle‑bracketed
 * chunks with backticks so they render as literal text.
 *
 * @param src Raw markdown
 * @param strict If true, wrap ANY inline <…> (except autolinks).
 *               If false, allow paired inline HTML like <strong>bold</strong>.
 */
function backtickInlineAngles(src: string, strict = true): string {
  const lines = src.split(/\r?\n/);
  let inFence = false;          // whether we're inside ``` or ~~~ fenced code
  const out: string[] = [];
  let para: string[] = [];      // accumulate lines of a paragraph

  const flushParagraph = () => {
    if (!para.length) return;
    let text = para.join('\n');

    // 1) Mask existing inline code spans so we don't alter their contents.
    // Matches `code` and ``code`` and longer.
    const masks: string[] = [];
    text = text.replace(/(`+)([\s\S]*?)\1/g, (m) => {
      const token = `\uE000C${masks.length}\uE001`;
      masks.push(m);
      return token;
    });

    // 2) (Non‑strict only) detect paired open/close tags in this paragraph.
    const openTags = new Set<string>();
    const closeTags = new Set<string>();
    if (!strict) {
      text.replace(/<([A-Za-z][\w:-]*)\b[^>]*?>/g, (_m, n) => { openTags.add(String(n).toLowerCase()); return ''; });
      text.replace(/<\/\s*([A-Za-z][\w:-]*)\s*>/g, (_m, n) => { closeTags.add(String(n).toLowerCase()); return ''; });
    }

    // 3) Replace inline <…> with backticked forms under our rules.
    text = text.replace(/<[^>\n]+>/g, (match, offset, full) => {
      // a) Preserve autolinks like <https://...> and <mailto:...>
      if (/^<(?:https?:\/\/|mailto:)/i.test(match)) return match;

      // b) If this is the only thing on its line, treat as block -> keep
      const lineStart = full.lastIndexOf('\n', offset) + 1;
      const lineEnd = full.indexOf('\n', offset);
      const line = full.slice(lineStart, lineEnd === -1 ? full.length : lineEnd);
      if (line.replace(match, '').trim().length === 0) return match;

      if (!strict) {
        // c) In non‑strict mode, allow paired inline HTML
        const open = /^<([A-Za-z][\w:-]*)\b[^>]*?>$/.exec(match);
        const close = /^<\/\s*([A-Za-z][\w:-]*)\s*>$/.exec(match);
        const selfClosing = /\/>$/.test(match);
        if (selfClosing) return match; // e.g. <br/>
        if (open) {
          const name = open[1].toLowerCase();
          if (!VOID_TAGS.has(name) && closeTags.has(name)) return match;
          if (VOID_TAGS.has(name)) {
            // void tags written inline without '/>' will be backticked below
          }
        } else if (close) {
          const name = close[1].toLowerCase();
          if (openTags.has(name)) return match;
        }
      }

      // d) Default: render literally as inline code
      return '`' + match.replace(/`/g, '\\`') + '`';
    });

    // 4) Unmask code spans
    text = text.replace(/\uE000C(\d+)\uE001/g, (_m, i) => masks[Number(i)]);
    out.push(text);
    para = [];
  };

  for (const line of lines) {
    // Toggle fenced code blocks (``` or ~~~ at start of line)
    if (/^\s*(```|~~~)/.test(line)) {
      flushParagraph();
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) { out.push(line); continue; }

    // Split paragraphs by blank lines
    if (line.trim() === '') { flushParagraph(); out.push(line); }
    else { para.push(line); }
  }
  flushParagraph();
  return out.join('\n');
}

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  // Toggle the behavior globally here
  private static readonly STRICT_ANGLE_MODE = true;

  constructor(private sanitizer: DomSanitizer) {
    // Configure Marked one time, synchronously
    marked.setOptions({ gfm: true, breaks: true, async: false });

    // Run our preprocessor BEFORE tokenization
    marked.use({
      hooks: {
        preprocess: (src: string) => backtickInlineAngles(src, MarkdownService.STRICT_ANGLE_MODE)
      }
    });
  }

  /**
   * Parse markdown to HTML, sanitize, and return SafeHtml for Angular binding.
   */
  render(md: string): SafeHtml {
    // marked.parse is typed as string | Promise<string>; async=false ensures string
    const html = marked.parse(md, { async: false }) as string;

    // Sanitize the HTML. If you embed real block iframes, whitelist them here.
    const clean = DOMPurify.sanitize(html, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['src','title','width','height','allow','allowfullscreen','frameborder','loading','referrerpolicy']
    });

    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
```

---

## How it works (step‑by‑step)

### 1) `marked.setOptions({ gfm: true, breaks: true, async: false })`
- **`gfm: true`** — enables GitHub‑flavored Markdown.
- **`breaks: true`** — single newlines become `<br>` (friendlier for prose).
- **`async: false`** — forces synchronous parsing so `marked.parse()` returns a string. This avoids TypeScript’s `string | Promise<string>` type and makes it acceptable to DOMPurify.

> Configure this **once** (service constructor) rather than on every render.

### 2) Preprocess hook (`marked.use({ hooks: { preprocess } })`)
`preprocess(src)` runs before tokenization. We exploit that to rewrite the raw markdown to be parser‑friendly.

We call **`backtickInlineAngles(src, strict)`**, which ensures inline `<…>` render as code, while leaving block HTML intact.

### 3) `backtickInlineAngles(src, strict)`
This is the heart of the solution.

- **Paragraph segmentation:** We iterate lines and buffer non‑blank lines as a paragraph. Blank lines flush the buffer. This lets us reason per paragraph/line about “inline” vs “block” occurrences.
- **Fence detection:** We detect lines that start code fences (` ``` ` or ` ~~~ `). Inside fenced code we **do nothing**, passing content through untouched.
- **Mask inline code spans:** Regex `(/(`+)([\s\S]*?)\1/g)` finds inline backtick code spans. We temporarily replace them with private tokens so our replacements don’t touch their contents.
- **(Non‑strict only) Paired tags:** We scan for open `<tag>` and close `</tag>` names in the paragraph to decide whether something like `<strong>bold</strong>` should remain as HTML.
- **Inline `<…>` substitution:** Regex `/<[^>\n]+>/g` finds any angle‑bracketed chunk confined to a single line. For each match:
  - If it’s an **autolink** (`<https://…>` or `<mailto:…>`), keep it.
  - If it’s **alone on its line**, treat as **block HTML**; keep it (so real embeds work).
  - In **non‑strict mode**, allow **paired inline HTML** (e.g., `<em>…</em>`) and **explicit self‑closing** tags (`<br/>`) to pass through.
  - Otherwise, wrap with backticks so it renders as literal text and **cannot break the paragraph**.
- **Unmask code spans** — restore the original inline code tokens.

### 4) `render(md: string): SafeHtml`
- Uses `marked.parse(md, { async: false })` → **HTML string**.
- Sanitizes with **DOMPurify** to neutralize any unsafe HTML (cross‑site scripting).
  - If you need to embed **block `<iframe>`**, we allow the tag and a small set of attributes.
- Returns a **`SafeHtml`** using Angular’s `DomSanitizer.bypassSecurityTrustHtml()` for binding with `[innerHTML]`.

---

## Using the service

**Component.ts**
```ts
@Component({
  selector: 'app-article',
  templateUrl: './article.component.html',
  standalone: true
})
export class ArticleComponent {
  markdown = `Before wrapping up, use the `<iframe>` tag like this...`;

  constructor(public md: MarkdownService) {}
}
```

**Component.html**
```html
<div [innerHTML]="md.render(markdown)"></div>
```

> If you prefer an **async** API (e.g., loading large files), convert `render()` to `async render(...)` and `await marked.parse()` (and then use the `| async` pipe). Keep the preprocess hook as is.

---

## SSR (Angular Universal) notes

- **DOMPurify in SSR:** DOMPurify expects a browser DOM. If you sanitize on the server, use the `dompurify` + `jsdom` pairing *or* conditionally skip sanitization during SSR and sanitize on the client. A minimalist pattern:

```ts
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  constructor(private sanitizer: DomSanitizer) {
    marked.setOptions({ gfm: true, breaks: true, async: false });
    marked.use({ hooks: { preprocess: (s) => backtickInlineAngles(s, true) } });
  }
  render(md: string): SafeHtml {
    const html = marked.parse(md, { async: false }) as string;
    const cleaned = this.isBrowser
      ? DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'], ADD_ATTR: ['src','title','width','height','allow','allowfullscreen','frameborder','loading','referrerpolicy'] })
      : html; // defer to client
    return this.sanitizer.bypassSecurityTrustHtml(cleaned);
  }
}
```

- **Hydration consistency:** If you defer sanitization to the client, ensure that server HTML equals client HTML or Angular will warn on hydration. To avoid diffs, either sanitize on both ends (with a DOM shim) or skip sanitization on both ends and sanitize *input sources* earlier (e.g., in your CMS ingestion pipeline).

---

## Configuration & customization

- **`STRICT_ANGLE_MODE`** — set to `true` to backtick any inline `<…>` (except autolinks). Set to `false` if your content legitimately uses inline HTML pairs like `<em>text</em>`.
- **Allow‑listing tags in DOMPurify** — only add what you absolutely need. If you don’t embed iframes, remove the `ADD_TAGS/ADD_ATTR` entries entirely.
- **Performance** — The preprocessor is linear in the size of the text and fast enough for typical blog posts. For very large documents, prefer doing the work once and caching the HTML.

---

## Examples

Given this Markdown:

```
Before wrapping up, use the <iframe> tag. Also a generic placeholder <T> in code.
Here is an autolink: <https://example.com>
And an inline pair: <strong>bold</strong>

<iframe src="https://www.youtube.com/embed/xyz" title="Demo"></iframe>
```

**Strict mode (`true`) output (conceptually):**

- `… the ```<iframe>``` tag …` → `… the \```<iframe>\``` tag …`
- `… placeholder <T> …` → `… placeholder \`<T>\` …`
- Autolink kept: `<https://example.com>`
- Paired inline HTML becomes code too: `\`<strong>bold</strong>\`` (because strict)
- The **block iframe** (alone on its own lines) is **preserved** and (after sanitization) will render.

**Non‑strict mode (`false`) differences:**

- `… <strong>bold</strong> …` stays as HTML (renders as **bold**).
- `… <iframe> …` and `… <T> …` are still backticked because they’re unmatched inline chunks.

---

## Limitations & tips

- This is a **textual** preprocessor. Highly pathological nesting of `<…>` inside the same line could need special‑case rules.
- If your content intentionally uses many inline HTML fragments, prefer **non‑strict mode** or narrow the rule to a whitelist of problematic tags.
- Always keep **sanitization** in place if you allow *any* HTML to render; never pipe raw user input directly to `bypassSecurityTrustHtml`.

---

## Troubleshooting

- **“No overload matches this call… string | Promise<string>”** — Ensure `async: false` and cast `marked.parse(... ) as string`, or `await marked.parse(...)` and make `render` async.
- **Iframes don’t render** — Remove `ADD_TAGS/ADD_ATTR` if not needed; otherwise ensure the `src` domain allows embedding (CSP `frame-ancestors` policy may block it).
- **SSR crash in DOMPurify** — Use the `isPlatformBrowser` guard or wire `jsdom` for server‑side sanitization.

---

## License / Attribution

Feel free to copy‑paste and adapt. Marked is MIT‑licensed. DOMPurify is BSD‑2‑Clause.
