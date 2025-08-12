// ========================================================================================================
// Scraping Constants
// ========================================================================================================





export const BROWSER_URLPORT = 'http://127.0.0.1:9222';

// Delay between clicks (in ms)
export const DELAY_BETWEEN_CLICKS = 1000;

// Number of retry attempts for clicks
export const RETRY_COUNT = 3;

// Max attempts to scroll with no new articles (stops if no new articles after N tries)
export const MAX_ATTEMPTS_WITHOUT_NEW = 5;

// Maximum number of articles to load on the page (prevents infinite scroll)
export const MAX_ARTICLES_NUMBER = 250;


// // 5 seconds for initial page load (htmlToMarkdown)
// export const INITIAL_PAGE_LOAD_DELAY = 5000;


// 15 (20) seconds for page load  (htmlToMarkdown)
export const INITIAL_PAGE_LOADING_DELAY = 15000;         

// 1 second for late JS rendering  (htmlToMarkdown)
export const SLEEP_DELAY_FOR_LATE_JS_RENDERING = 1000;   

// 1 second to wait for gist iframes to appear (getCleanedPageContent) after page auto-scroll
export const AFTER_AUTOSCROLL_GIST_IFRAME_SELECTOR_DELAY = 1000;

// 5 seconds to wait for gist iframes to appear  (getCleanedPageContent)
export const GIST_IFRAME_SELECTOR_DELAY = 5000;          

// 15 (20) seconds for gist page load  (extractCodeFromIframe)
export const GIST_PAGE_LOADING_DELAY = 15000;            


// Delay to open a new tab - avoiding rapid tab creation (collectPostsFromUrlTabs)
export const OPEN_NEW_TAB_DELAY = 500;                 

// 15 seconds for initial page load (collectPostsFromUrlTabs)
export const TAB_INITIAL_PAGE_LOADING_DELAY = 15000;   

// 1 second for additional page delay for complete page loading (scrapeMediumArticle)
export const ADDITIONAL_PAGE_DELAY = 1000;             


// Auto-scroll delay between scrolls (in ms) - used calling autoScrollToEnd() from the wrapper function scrapeList()
export const SCROLL_DELAY = 1500;

// Default auto-scroll delay for article pages used in the function: autoScrollArticlePage()
export const DEFAULT_AUTOSCROLL_DELAY = 100;           







