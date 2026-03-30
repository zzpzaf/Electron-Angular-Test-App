// scrape-constants.ts

// ========================================================================================================
// Scraping Constants
// ========================================================================================================



export const BROWSER_URLPORT = 'http://127.0.0.1:9222';

// // Delay between clicks (in ms)
// export const DELAY_BETWEEN_CLICKS = 1000;

// // Number of retry attempts for clicks
// export const RETRY_COUNT = 3;

// // Max attempts to scroll with no new articles (stops if no new articles after N tries)
// export const MAX_ATTEMPTS_WITHOUT_NEW = 5;

// // Maximum number of articles to load on the page (prevents infinite scroll)
// export const MAX_ARTICLES_NUMBER = 250;


// // // 5 seconds for initial page load (htmlToMarkdown)
// // export const INITIAL_PAGE_LOAD_DELAY = 5000;


// // 15 (20) seconds for page load  (htmlToMarkdown)
// export const INITIAL_PAGE_LOADING_DELAY = 15000;         

// // 1 second for late JS rendering  (htmlToMarkdown)
// export const SLEEP_DELAY_FOR_LATE_JS_RENDERING = 1000;   

// // 1 second to wait for gist iframes to appear (getCleanedPageContent) after page auto-scroll
// export const AFTER_AUTOSCROLL_GIST_IFRAME_SELECTOR_DELAY = 1000;

// // 5 seconds to wait for gist iframes to appear  (getCleanedPageContent)
// export const GIST_IFRAME_SELECTOR_DELAY = 5000;          

// // 15 (20) seconds for gist page load  (extractCodeFromIframe)
// export const GIST_PAGE_LOADING_DELAY = 15000;            


// // Delay to open a new tab - avoiding rapid tab creation (collectPostsFromUrlTabs)
// export const OPEN_NEW_TAB_DELAY = 500;                 

// // 15 seconds for initial page load (collectPostsFromUrlTabs)
// export const TAB_INITIAL_PAGE_LOADING_DELAY = 15000;   

// // 1 second for additional page delay for complete page loading (scrapeMediumArticle)
// export const ADDITIONAL_PAGE_DELAY = 1000;             


// // Auto-scroll delay between scrolls (in ms) - used calling autoScrollToEnd() from the wrapper function scrapeList()
// export const SCROLL_DELAY = 1500;

// // Default auto-scroll delay for article pages used in the function: autoScrollArticlePage()
// export const DEFAULT_AUTOSCROLL_DELAY = 100;           

// 250906 - Refactored a 1 timeConst constant:
export const timeConst = {
  // Retry/click logic
  DELAY_BETWEEN_CLICKS: 1000,   // Delay between clicks (in ms)
  RETRY_COUNT: 3,               // Number of retry attempts for clicks
  MAX_ATTEMPTS_WITHOUT_NEW: 5,  // Max attempts to scroll with no new articles

  // 260328 - Browser connection / monitoring
  PROTOCOL_TIMEOUT: 600000,     // 10 min for long-running page.evaluate()/CDP calls
  MARKDOWN_SCRAPE_CONCURRENCY: 3, // Parallel article tabs when scraping full markdown
  ENABLE_SCRAPE_TIMING_LOGS: true, // Emit step durations for long-page monitoring

  // Page/article loading
  MAX_ARTICLES_NUMBER: 250,     
  INITIAL_PAGE_LOADING_DELAY: 15000,     // 15 sec for page load (htmlToMarkdown)
  SLEEP_DELAY_FOR_LATE_JS_RENDERING: 1000, // 1 sec for late JS rendering
  ADDITIONAL_PAGE_DELAY: 1000,           // Extra delay for complete load in scrapeMediumArticle

  // Gist iframe handling
  AFTER_AUTOSCROLL_GIST_IFRAME_SELECTOR_DELAY: 1000, // 1 sec after autoscroll
  GIST_IFRAME_SELECTOR_DELAY: 5000,                  // 5 sec to wait for gist iframe
  GIST_PAGE_LOADING_DELAY: 15000,                    // 15 sec for gist page load

  // Tab handling
  OPEN_NEW_TAB_DELAY: 500,               // Delay before opening a new tab
  TAB_INITIAL_PAGE_LOADING_DELAY: 15000, // 15 sec for tab initial load

  // Auto-scroll
  SCROLL_DELAY: 1500,                    // Delay between scrolls in scrapeList()
  DEFAULT_AUTOSCROLL_DELAY: 100,         // Default delay for autoScrollArticlePage()
  AUTOSCROLL_MAX_DURATION_MS: 240000,    // Hard stop for article autoscroll loop
  AUTOSCROLL_MAX_STAGNANT_STEPS: 12      // Stop after N steps without page-growth/progress
} as const;








// Basic (meta-data) selectors here
// Used in function: scrapeMediumArticle()

// export const metaSEL = {
//   publication: 'h2 > div',
//   title: 'h1[data-testid="storyTitle"]',
//   leadImage: 'figure img',
//   author: 'a[data-testid="authorName"]',
//   dateOuter: 'div.speechify-ignore.bi.m',   // 250905 Selectors Update : bh.m -> bi.m
//   dateInner: 'div.ac.ag',                   // 250905 Selectors Update : ac.af -> ac.ag   
//   likesButton: '.pw-multi-vote-count button',
//   commentsCount: 'button[aria-label="responses"] .pw-responses-count',
// } as const;

// In the future for new variants (e.g. .bj or .ah), we can 
// just add them to the :is() list:
// dateOuter: 'div.speechify-ignore:is(.bi,.bh,.bj).m',
// dateInner: 'div.ac:is(.af,.ag,.ah)',

export const metaSEL = {
  publication: 'h2 > div',
  title: 'h1[data-testid="storyTitle"]',
  leadImage: 'figure img',
  author: 'a[data-testid="authorName"]',
  // dateOuter matches both legacy and new variants:
  // <div class="speechify-ignore bi m">, <div class="speechify-ignore bh m">, <div class="speechify-ignore bd e">
  // dateInner matches both legacy and new variants:
  // <div class="ac af">, <div class="ac ag">, <div class="v y">
  dateOuter: 'div.speechify-ignore:is(.bi,.bh).m, div.speechify-ignore.bd.e',
  dateInner: 'div.ac:is(.af,.ag), div.v.y',
  
  
  likesButton: '.pw-multi-vote-count button',
  commentsCount: 'button[aria-label="responses"] .pw-responses-count',
} as const;


// Query selectors for cleaning the content
// Used in function: getCleanedPageContent()
export const cleanSEL = {
  title: 'h1[data-testid="storyTitle"]',
  speechifyIgnoreDivs: 'div[class^="speechify-ignore"]',
  headings: 'h1',
  iframes: 'iframe',
  cleanTags: 'script, style, noscript',
} as const;


// Query selectors for a Medium List
// Used in function: scrapeMediumList()
export const listSEL = {
  headings: 'h1',
  allArticle: 'article',
  postInfoBlock: 'span:has(svg[width="16"])',
  pubName: 'div a[href*="medium.com"] p',
  authorName: 'div a[href^="/@"] p',
} as const;


// To-Do: Add Gist-related selectors