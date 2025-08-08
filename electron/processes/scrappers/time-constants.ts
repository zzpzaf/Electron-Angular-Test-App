// ========================================================================================================
// Timer Constants
// ========================================================================================================

// page-converter
// --------------------------------------------------------------------------------------------------------
export const INITIAL_PAGE_LOADING_DELAY = 15000;         // 15 (20) seconds for page load  (htmlToMarkdown)
export const SLEEP_DELAY_FOR_LATE_JS_RENDERING = 1000;   // 1 second for late JS rendering  (htmlToMarkdown)
export const GIST_IFRAME_SELECTOR_DELAY = 5000;          // 5 seconds to wait for gist iframes to appear  (getCleanedPageContent)
export const GIST_PAGE_LOADING_DELAY = 15000;            // 15 (20) seconds for gist page load  (extractCodeFromIframe)

// scrape-functions
// --------------------------------------------------------------------------------------------------------
export const OPEN_NEW_TAB_DELAY = 500;                 // Delay to open a new tab - avoiding rapid tab creation (collectPostsFromUrlTabs)
export const TAB_INITIAL_PAGE_LOADING_DELAY = 15000;   // 15 seconds for initial page load (collectPostsFromUrlTabs)
export const ADDITIONAL_PAGE_DELAY = 1000;             // 1 second for additional page delay for complete page loading (scrapeMediumArticle)
export const DEFAULT_AUTOSCROLL_DELAY = 100;           // (autoScrollArticlePage)







