
## The page-converter.ts file


### Ppackages:

---

- **`import puppeteer from 'puppeteer-extra';`**
  - **Package:** `puppeteer-extra`
  - **Description:**  
    An enhanced version of Puppeteer that supports plugins for browser automation.  
    Allows you to use plugins to bypass bot detection, automate browsers, and customize behavior.

---

- **`import StealthPlugin from 'puppeteer-extra-plugin-stealth';`**
  - **Package:** `puppeteer-extra-plugin-stealth`
  - **Description:**  
    A plugin for `puppeteer-extra` that helps evade bot detection by modifying browser fingerprints and behaviors.  
    Commonly used to bypass anti-bot measures on websites.

---

- **`import TurndownService from 'turndown';`**
  - **Package:** `turndown`
  - **Description:**  
    A library for converting HTML to Markdown.  
    `TurndownService` is the main class for performing the conversion and adding custom rules.

---

- **`import { Browser, Page } from 'puppeteer';`**
  - **Package:** `puppeteer`
  - **Description:**  
    Type definitions for Puppeteer objects:  
    - `Browser`: Represents a browser instance.
    - `Page`: Represents a browser tab or page.

---

- **`import fetch from 'node-fetch';`**
  - **Package:** `node-fetch`
  - **Description:**  
    A Node.js implementation of the browser’s `fetch` API for making HTTP requests.

---

- **`import { JSDOM } from 'jsdom';`**
  - **Package:** `jsdom`
  - **Description:**  
    A library that provides a browser-like DOM environment in Node.js.  
    `JSDOM` is used to parse and manipulate HTML as if you were in a browser.

---

### Functions:

### `htmlToMarkdown(input: string, isRawHtml: boolean): Promise<string>`
- **Purpose:** Converts either a raw HTML string or a web page URL to Markdown.
- **How it works:**
  - Connects to an existing Puppeteer browser instance.
  - Opens a new page and sets a realistic user agent.
  - Loads either the raw HTML (using a data URL) or navigates to the provided URL.
  - Waits for the page to fully render and checks for bot protection (Cloudflare).
  - Calls `getCleanedPageContent()` to extract cleaned HTML and any gist iframe sources.
  - Calls `processGists()` to replace gist embeds with actual code blocks.
  - Uses TurndownService with custom rules to convert the processed HTML to Markdown.
  - Returns the Markdown string.

---

### `getCleanedPageContent(page: Page): Promise<{ html: string; iframeSrcs: string[] }>`
- **Purpose:** Extracts and cleans the main content from a Puppeteer page, and collects sources of embedded gist iframes.
- **How it works:**
  - Scrolls the article page to ensure all content is loaded.
  - Waits for gist iframes to appear (with a timeout).
  - Collects all src attributes from `figure iframe` elements.
  - Runs a script in the page context to:
    - Remove scripts, styles, and noscript tags.
    - Remove specific unwanted text and divs (e.g., Speechify ignore).
    - Fix heading levels (converts extra `<h1>` to `<h2>`).
    - Removes content before the first heading.
    - Clones the main content container for cleaning.
  - Returns the cleaned HTML and the list of gist iframe sources.

---

### `processGists(browser: Browser, html: string, iframeSrcs: string[]): Promise<string>`
- **Purpose:** Replaces gist embeds in the HTML with actual code blocks and links.
- **How it works:**
  - Loads the HTML into a JSDOM document.
  - Processes `.gist-meta` blocks:
    - Finds raw code and permalink URLs.
    - Fetches the raw code and replaces the gist-meta block with a `<pre><code>` block and a link.
  - Processes gist iframes:
    - For each iframe source, calls `extractCodeFromIframe()` to get the code and permalink.
    - Replaces the corresponding figure with a code block and link.
  - Returns the updated HTML with code blocks in place of gist embeds.

---

### `extractCodeFromIframe(browser: Browser, iframeUrl: string): Promise<{ code: string; gistPermalink?: string } | null>`
- **Purpose:** Extracts code and gist permalink from a gist embedded in an iframe.
- **How it works:**
  - Opens a new Puppeteer page and navigates to the iframe URL.
  - In the page context, finds the raw code link and gist permalink.
  - Fetches the raw code directly from the raw code URL.
  - Returns the code and permalink (if found).
  - Closes the Puppeteer page after extraction.

---

**Summary:**  
These functions work together to load a web page or HTML, clean and extract its main content, process embedded GitHub Gists (both inline and iframe-based), and convert everything to Markdown with proper code block formatting. The workflow ensures that code snippets from Gists are included as Markdown code blocks, making the output suitable for documentation or publishing.



