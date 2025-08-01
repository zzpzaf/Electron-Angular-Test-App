import { Rule } from 'turndown';



// --------------------------------------------------------------------------------------------
// Turndown Rules
// --------------------------------------------------------------------------------------------

// turndown rules: code-blocks
export function fencedCodeBlockRule(): Rule {
  return {
    // filter: (node: HTMLElement) => {
    //   return (
    //     (node.nodeName === 'PRE' && !!node.querySelector('code')) || // force boolean
    //     (node.className?.includes('code') ?? false) ||               // force boolean
    //     (node.className?.includes('prism') ?? false) ||              // force boolean
    //     node.getAttribute?.('data-testid') === 'codeBlock'
    //   );
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


// Medium Friendly Code Block Rule
// -Detects language (if possible from class names like language-js, lang-python, hljs).
// -Preserves line breaks by replacing <br> tags with \n.
// -Strips highlighting spans while keeping raw code text.
export function mediumFriendlyCodeBlockRule(): Rule {
  return {
    filter: (node: HTMLElement) => {
      if (!node || node.nodeName !== 'PRE') return false;

      const spanCount = node.getElementsByTagName('span').length;
      const brCount = node.getElementsByTagName('br').length;

      return spanCount > 3 || brCount > 0;
    },

    replacement: (_content, node) => {
      // Ensure we have a real element with innerHTML
      const html = (node as any).innerHTML || '';
      const classList = (node as any).className?.split(/\s+/) || [];

      // Convert <br> → \n
      let codeHtml = html.replace(/<br\s*\/?>/gi, '\n');

      // Strip all HTML tags to leave only text
      let codeText = codeHtml.replace(/<[^>]+>/g, '');

      // Detect language
      let lang = '';
      const langClass = classList.find(
        (c: string) =>
          c.startsWith('language-') ||
          c.startsWith('lang-') ||
          /^(js|ts|html|css|python|java|c|cpp)$/i.test(c)
      );
      if (langClass) {
        lang = langClass.replace(/^language-/, '').replace(/^lang-/, '');
      }

      return `\n\`\`\`${lang}\n${codeText.trim()}\n\`\`\`\n`;
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
