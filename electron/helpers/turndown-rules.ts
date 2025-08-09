import { Rule } from 'turndown';
import { decode as hedecode } from 'he';


// --------------------------------------------------------------------------------------------
// Turndown Rules
// --------------------------------------------------------------------------------------------

// turndown rules: code-blocks
export function fencedCodeBlockRule(): Rule {
  return {
    filter: (node) => {
      return (
        (node.nodeName === 'PRE' && !!node.querySelector('code')) ||
        !!node.className?.includes('code') ||
        !!node.className?.includes('prism') ||
        node.getAttribute?.('data-testid') === 'codeBlock'
      );
    },
    replacement: (content, node) => {
      const codeText = node.textContent || '';
      return `\n\`\`\`\n${codeText.trim()}\n\`\`\`\n`;
    },
  };
}


// turndown rule: inline-code
export function inlineCodeRule(): Rule {
  return {
    filter: (node) => {
      return node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE';
    },
    replacement: (content) => {
      return '`' + content + '`';
    },
  };
}




// 250809
// Helper function to decode HTML entities deeply
// This function decodes HTML entities multiple times to handle cases where entities are double-encoded.
// For example, if the input is "&amp;lt;" it will decode to "&lt;" and then to "<".
// It does this up to 5 times, which is usually sufficient for most cases.
// The loop continues until no further changes are made, ensuring all entities are fully decoded
function deepDecode(s: string): string {
  // Safely handle double-encoded entities (&amp;lt; -> &lt; -> <)
  let prev = s;
  for (let i = 0; i < 5; i++) {
    const next = hedecode(prev);
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

// 250809
// Helper function to create a safe Markdown code fence
// This ensures the fence is always longer than any backticks in the code.
// This prevents Markdown from misinterpreting the code block if it contains backticks.
// The fence will be at least 3 backticks, or one more than the longest sequence of backticks in the code.
// This is important because Markdown parsers can misinterpret code blocks if
// the fence length matches the longest backtick sequence in the code.
// For example, if the code contains ```, a fence of ``` will be misinterpreted
// as ending the code block too early, causing formatting issues.
// Checks the code for existing backticks (``
// If your Markdown fence is the same length as the longest backtick sequence in the code, Markdown will think the code fence ends too early.
// This function ensures the fence is one backtick longer than any in the code.
// Minimum is always 3 backticks.
function safeFenceFor(code: string): string {
  // If code already contains ``` choose a longer fence
  const matches = code.match(/`+/g);
  const maxTicks = matches ? Math.max(...matches.map(m => m.length)) : 0;
  const desired = 3;
  return '`'.repeat(Math.max(desired, maxTicks + 1));
}



// updated 250809
// Medium Friendly Code Block Rule - 
// -Detects language (if possible from class names like language-js, lang-python, hljs).
// -Preserves line breaks by replacing <br> tags with \n.
// -Strips highlighting spans while keeping raw code text.
// -Decodes HTML entities after stripping tags (otherwise < becomes a tag and gets removed).
// -Handles double-encoded entities and pick a safe fence if the code contains backticks.
//
// Targets <pre> blocks with Medium-like syntax highlighting (<span>s) or <br> line breaks.
// Converts <br> tags to real newlines and strips all HTML tags while keeping text.
// Replaces non-breaking spaces and deep-decodes HTML entities (handles double-encoding).
// Cleans up whitespace and normalizes line endings.
// Detects programming language from class attributes (language-js, lang-python, etc.).
// Uses safeFenceFor() to ensure Markdown fences are longer than any backticks in the code.
// Outputs clean fenced Markdown code blocks with optional language hint.
// Improves compatibility with Medium’s exported HTML for code blocks.
export function mediumFriendlyCodeBlockRule(): Rule {
  return {
    filter: (node: HTMLElement) => {
      if (!node || node.nodeName !== 'PRE') return false;
      const spanCount = node.getElementsByTagName('span').length;
      const brCount = node.getElementsByTagName('br').length;
      return spanCount > 3 || brCount > 0; // Medium-like highlighted blocks
    },

    replacement: (_content, node) => {
      const html = (node as any).innerHTML || '';
      const classList = ((node as any).className || '').split(/\s+/);

      // 1) Convert <br> to newlines (keep structure)
      let codeHtml = html.replace(/<br\s*\/?>/gi, '\n');

      // 2) Strip ALL tags, keep their text (spans, etc.)
      //    Important: decode AFTER this step.
      let codeText = codeHtml.replace(/<[^>]+>/g, '');

      // 3) Normalize NBSP and decode entities (deep to handle double-encoding)
      codeText = codeText.replace(/\u00A0/g, ' ');       // &nbsp; → space
      codeText = deepDecode(codeText);

      // 4) Tidy whitespace/newlines
      codeText = codeText
        .replace(/\r\n?/g, '\n')         // windows → unix
        .replace(/\n{3,}/g, '\n\n')      // squash mega-blank lines
        .trimEnd();

      // 5) Detect language from classes if available
      let lang = '';
      const langClass = classList.find(
        (c: string) =>
          c.startsWith('language-') ||
          c.startsWith('lang-') ||
          /^(js|ts|tsx|jsx|html|css|scss|less|python|py|java|c|cpp|cs|go|rust|rb|php|sh|bash|sql|json|yaml|yml|xml)$/i.test(c)
      );
      if (langClass) {
        lang = langClass.replace(/^language-/, '').replace(/^lang-/, '');
      }

      // 6) Pick a safe fence (avoids closing if code contains ``` already)
      const fence = safeFenceFor(codeText);

      return `\n${fence}${lang ? lang : ''}\n${codeText}\n${fence}\n`;
    },
  };
}






// Custom Heading Rule
// overrides Turndown’s default heading rule so it always produces
// ATX-style (#, ##, ###) headings, instead of repeated "=" characters below the text line
export function atxHeadingRule(): Rule {
  return {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement: (content, node) => {
      const level = parseInt(node.nodeName.charAt(1), 10); // Extract number from h1..h6
      return `\n${'#'.repeat(level)} ${content.trim()}\n`;
    },
  };
}
