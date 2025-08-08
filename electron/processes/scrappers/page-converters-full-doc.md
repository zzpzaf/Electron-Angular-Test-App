# Documentation: `page-converters.ts`

## Packages

The following external and internal libraries are used in this file:

- **`../../../shared/constants`** — Internal utility or third-party module.
- **`../../helpers/turndown-rules`** — Internal utility or third-party module.
- **`../scrappers/scrape-functions`** — Internal utility or third-party module.
- **`jsdom`** — Used to parse and interact with HTML documents in a simulated DOM environment.
- **`node-fetch`** — Internal utility or third-party module.
- **`puppeteer`** — Internal utility or third-party module.
- **`puppeteer-extra`** — Internal utility or third-party module.
- **`puppeteer-extra-plugin-stealth`** — Internal utility or third-party module.
- **`turndown`** — An HTML-to-Markdown converter library.

---

## Functions

This section explains each function in the file in detail.

## `htmlToMarkdown`

Converts a given HTML string to Markdown format using Turndown and DOM processing.

**Parameters:**
- `html: string`: The raw HTML content to convert.
- `url?: string`: Optional URL context for processing GitHub Gists.

**Returns:**
- `string`: The converted Markdown content.

**Details:**
- Initializes `TurndownService`.
- Cleans the input HTML using `getCleanedPageContent`.
- Handles embedded GitHub Gists via `processGists`.
- Converts the cleaned DOM to Markdown.

**Called by:**
- (Not called by any other function in this file)

**Calls:**
- getCleanedPageContent
- processGists

---

## `getCleanedPageContent`

Cleans the HTML content by parsing and removing unwanted elements using jsdom.

**Parameters:**
- `html: string`: Raw HTML string.
- `url?: string`: Optional URL used when processing Gist iframes.

**Returns:**
- `HTMLElement`: Cleaned HTML body element.

**Details:**
- Parses HTML with `jsdom`.
- Filters out `<script>` and non-essential elements.
- Calls `processGists` to inline any GitHub Gists.

**Called by:**
- htmlToMarkdown

**Calls:**
- processGists

---

## `processGists`

Replaces embedded GitHub Gist iframes in a DOM with their actual code content.

**Parameters:**
- `dom: JSDOM`: The jsdom document instance.
- `url?: string`: URL for resolving relative paths or IDs in Gist embedding.

**Returns:**
- `void`: Mutates the DOM in place.

**Details:**
- Finds `.gist` iframe elements.
- Calls `extractCodeFromIframe` to extract actual code from the iframe's document.
- Replaces each iframe with a preformatted code block.

**Called by:**
- getCleanedPageContent
- htmlToMarkdown

**Calls:**
- extractCodeFromIframe

---

## `extractCodeFromIframe`

Extracts code content from a GitHub Gist iframe’s document.

**Parameters:**
- `doc: Document`: The iframe's document object.

**Returns:**
- `string`: Extracted and formatted code content as HTML.

**Details:**
- Selects all code lines in the iframe.
- Joins them into a single string.
- Returns them wrapped in `<pre>` HTML.

**Called by:**
- processGists

**Calls:**
- (Does not call other functions in this file)

---
