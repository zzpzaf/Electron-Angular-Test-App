import { inject, Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';


const VOID_TAGS = new Set([
  'area','base','br','col','embed','hr','img','input','link','meta',
  'param','source','track','wbr'
]);


/*
backticks any <…> inline (not on its own line),
skips fenced code and existing inline code,
preserves autolinks (<http…>, <mailto…>),
lets you choose behavior:
  strict = true → backtick every inline <…> (your ask).
  strict = false → keep real inline HTML pairs like <strong>bold</strong>; only backtick unmatched/solo ones.

How it behaves (strict = true):
  … use the <iframe> tags … → … use the `<iframe>` tags …
  … placeholder <T> … → … placeholder `<T>` …
  … a <br> here … or … <img …> … → wrapped as code (so they don’t break prose)
Standalone HTML blocks (on their own line(s)) → unchanged, still render.
If you prefer to allow real inline HTML like <strong>bold</strong>, set STRICT_ANGLE_MODE = false.
*/
function backtickInlineAngles(src: string, strict = true): string {
  const lines = src.split(/\r?\n/);
  let inFence = false;
  const out: string[] = [];
  let para: string[] = [];

  const flush = () => {
    if (!para.length) return;
    let text = para.join('\n');

    // mask inline code spans: `code`, ``code``
    const masks: string[] = [];
    text = text.replace(/(`+)([\s\S]*?)\1/g, m => {
      const t = `\uE000C${masks.length}\uE001`;
      masks.push(m);
      return t;
    });

    // for non-strict mode, detect paired tags inside this paragraph
    const openTags = new Set<string>();
    const closeTags = new Set<string>();
    if (!strict) {
      text.replace(/<([A-Za-z][\w:-]*)\b[^>]*?>/g, (_m, n) => { openTags.add(n.toLowerCase()); return ''; });
      text.replace(/<\/\s*([A-Za-z][\w:-]*)\s*>/g, (_m, n) => { closeTags.add(n.toLowerCase()); return ''; });
    }

    text = text.replace(/<[^>\n]+>/g, (m, offset, str) => {
      // keep autolinks like <https://...> or <mailto:...>
      if (/^<(?:https?:\/\/|mailto:)/i.test(m)) return m;

      // determine if it's the only thing on its line (treat as block → keep)
      const lineStart = str.lastIndexOf('\n', offset) + 1;
      const lineEnd = str.indexOf('\n', offset);
      const line = str.slice(lineStart, lineEnd === -1 ? str.length : lineEnd);
      const lineWithout = line.replace(m, '').trim();
      if (!lineWithout) return m;

      if (!strict) {
        const open = /^<([A-Za-z][\w:-]*)\b[^>]*?>$/.exec(m);
        const close = /^<\/\s*([A-Za-z][\w:-]*)\s*>$/.exec(m);
        const selfClosing = /\/>$/.test(m);
        const isVoid = open && VOID_TAGS.has(open[1].toLowerCase());
        if (selfClosing) return m; // e.g., <br/>
        if (open && !isVoid && closeTags.has(open[1].toLowerCase())) return m; // paired inline HTML
        if (close && openTags.has(close[1].toLowerCase())) return m;           // paired inline HTML
      }

      // wrap with backticks so it renders as literal text
      return '`' + m.replace(/`/g, '\\`') + '`';
    });

    // unmask code spans
    text = text.replace(/\uE000C(\d+)\uE001/g, (_m, i) => masks[Number(i)]);
    out.push(text);
    para = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { flush(); inFence = !inFence; out.push(line); continue; }
    if (inFence) { out.push(line); continue; }
    if (line.trim() === '') { flush(); out.push(line); } else { para.push(line); }
  }
  flush();
  return out.join('\n');
}




@Injectable({
  providedIn: 'root'
})
export class Markshow {
  
  private sanitizer = inject(DomSanitizer);

  constructor() {

    // marked settings/options
    marked.setOptions({
      gfm: true,
      breaks: true,
      async: false
    });

    // === choose behavior here ===
    const STRICT_ANGLE_MODE = true; // your preferred "any <...> inline → code"
    marked.use({
      hooks: {
        preprocess(src) {
          return backtickInlineAngles(src, STRICT_ANGLE_MODE);
        }
      }
    });
  }


  render(md: string): SafeHtml {
    const html = marked.parse(md, { async: false }) as string;
    const clean = DOMPurify.sanitize(html, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['src','title','width','height','allow','allowfullscreen','frameborder','loading','referrerpolicy']
    });
    // return this.sanitizer.bypassSecurityTrustHtml(clean);
    const retText: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(clean);
    return retText;
  }

}
