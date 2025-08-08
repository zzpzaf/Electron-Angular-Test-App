# Documentation: `scrape-functions.ts`

## Packages

The following external and internal libraries are used in this file:

- **`../../../shared/projectObjects/varObjects`** — Contains shared TypeScript interfaces or types like `PostData`.
- **`../../../shared/utils/shared-utils`** — Contains utility functions like `extractFirstPathPart`.
- **`../../helpers/electron-utils`** — Likely contains utility functions such as `formatDate` used in scraping.
- **`electron`** — Used for Electron’s `BrowserWindow` class to interact with the desktop window.
- **`p-limit`** — Limits the number of concurrently running async functions.
- **`puppeteer`** — A Node library for controlling headless Chrome or Chromium browsers via the DevTools Protocol.
- **`puppeteer-extra`** — A plugin-based wrapper around Puppeteer that allows stealth plugins and other middlewares.
- **`puppeteer-extra-plugin-stealth`** — A Puppeteer plugin to make headless browser automation harder to detect.
- **`turndown`** — An HTML-to-Markdown converter library.

---

## Functions

This section explains each function in the file in detail.

## `scrapeArticleBasic`

**Parameters:**
- _(See implementation for details)_

**Returns:**
- _(See implementation for return type)_

**Details:**
- _(Auto-generated from source. Add specific notes manually if needed.)_

**Called by:**
- (Not called by any other function in this file)

**Calls:**
- scrapeMediumArticle, formatDate, extractFirstPathPart
## `collectPostsFromUrlTabs`

**Parameters:**
- _(See implementation for details)_

**Returns:**
- _(See implementation for return type)_

**Details:**
- _(Auto-generated from source. Add specific notes manually if needed.)_

**Called by:**
- (Not called by any other function in this file)

**Calls:**
- scrapeMediumArticle, scrapeMediumMarkdownContent, formatDate
## `scrapeMediumArticle`

Specifically scrapes articles from Medium.com using DOM selectors tailored to Medium's structure.

**Parameters:**
- `url: string`: Medium article URL.
- `browser: Puppeteer.Browser`: Puppeteer browser instance.

**Returns:**
- A `PostData` object with Medium-specific article metadata.

**Details:**
- Extracts title, subtitle, tags, publish date, etc.
- Navigates Medium's DOM and handles optional metadata fields.
- Falls back gracefully if the page structure is not standard.

**Called by:**
- collectPostsFromUrlTabs
- scrapeArticleBasic

**Calls:**
- (Does not call other functions in this file)

---

## `scrapeList`

Extracts a list of article links from a single page.

**Parameters:**
- `url: string`: A webpage containing multiple article links.
- `browser: Puppeteer.Browser`: Puppeteer browser instance.

**Returns:**
- An array of article URLs found on the page.

**Details:**
- Navigates to the list page.
- Extracts anchor tags and filters for valid article links.
- Returns deduplicated URLs.

**Called by:**
- (Not called by any other function in this file)

**Calls:**
- scrapeMediumList, autoScrollToEnd, formatDate, extractFirstPathPart


---

## `scrapeMediumList`

Extracts Medium.com article URLs from a user profile, tag, or publication page.

**Parameters:**
- `url: string`: Medium listing page (e.g. tag or author).
- `browser: Puppeteer.Browser`: Puppeteer browser instance.

**Returns:**
- An array of Medium article URLs.

**Details:**
- Scrolls to the end of the page using `autoScrollToEnd` to load all articles.
- Selects article links from dynamically loaded content.
- Filters duplicates and irrelevant links.

**Called by:**
- scrapeList

**Calls:**
- (Does not call other functions in this file)

---

## `autoScrollToEnd`

Automatically scrolls a page to the bottom to trigger lazy loading or infinite scroll.

**Parameters:**
- `page: Puppeteer.Page`: The Puppeteer page to scroll.

**Returns:**
- A `Promise<void>` that resolves once the page is fully scrolled.

**Details:**
- Repeatedly scrolls down in small increments with a delay (`SCROLL_DELAY`).
- Stops when no more new content loads.

**Called by:**
- scrapeList

**Calls:**
- sleep

---

## `sleep`

Pauses execution for a given amount of time.

**Parameters:**
- `ms: number`: Milliseconds to wait.

**Returns:**
- A `Promise<void>` that resolves after the delay.

**Details:**
Utility to pause execution for a given number of milliseconds.
- Used to delay browser actions.
- Simple async delay helper using `setTimeout`.

**Called by:**
- autoScrollToEnd
- waitForEnter

**Calls:**
- (Does not call other functions in this file)

---

## `waitForEnter`
Utility function that waits for the user to press the 'Enter' key in the console.
- Waits for user input in the console.
- Useful for debugging or manual intervention.

**Parameters:**
- None

**Returns:**
- A `Promise<void>` that resolves when Enter is pressed.

**Details:**
- Uses Node's `readline` module to listen for input.

**Called by:**
- (Not called by any other function in this file)

**Calls:**
- sleep


---

## `scrapeMediumMarkdownContent`

**Parameters:**
- _(See implementation for details)_

**Returns:**
- _(See implementation for return type)_

**Details:**
- _(Auto-generated from source. Add specific notes manually if needed.)_

**Called by:**
- collectPostsFromUrlTabs

**Calls:**
- (Does not call other functions in this file)

## `autoScrollArticlePage`

**Parameters:**
- _(See implementation for details)_

**Returns:**
- _(See implementation for return type)_

**Details:**
- _(Auto-generated from source. Add specific notes manually if needed.)_

**Called by:**
- (Not called by any other function in this file)

**Calls:**
- (Does not call other functions in this file)

## `clickWithRetry`

**Parameters:**
- _(See implementation for details)_

**Returns:**
- _(See implementation for return type)_

**Details:**
- _(Auto-generated from source. Add specific notes manually if needed.)_

**Called by:**
- (Not called by any other function in this file)

**Calls:**
- sleep
