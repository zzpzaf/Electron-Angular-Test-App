// electron/processes/scrappers/scrape-functions.ts

// This file is part of an Electron application that scrapes basic article data from a given URL.
// 250715 - 250830

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type * as Puppeteer from 'puppeteer';
import { BrowserWindow } from 'electron';
import pLimit from 'p-limit';
import { JSDOM } from 'jsdom';

import TurndownService from 'turndown';
import {
  fencedCodeBlockRule,
  inlineCodeRule,
  mediumFriendlyCodeBlockRule,
} from '../../helpers/turndown-rules';

import { PostData } from '../../../shared/projectObjects/varObjects';
import { formatDate } from '../../helpers/electron-utils';
import { extractFirstPathPart } from '../../../shared/utils/shared-utils';

import {
  BROWSER_URLPORT,
  MAX_ARTICLES_NUMBER,
  SCROLL_DELAY,
  DEFAULT_AUTOSCROLL_DELAY,
  ADDITIONAL_PAGE_DELAY,
  GIST_IFRAME_SELECTOR_DELAY,
  GIST_PAGE_LOADING_DELAY,
  OPEN_NEW_TAB_DELAY,
  TAB_INITIAL_PAGE_LOADING_DELAY,
  AFTER_AUTOSCROLL_GIST_IFRAME_SELECTOR_DELAY,
} from './scrape-constants';

// ========================================================================================================

// Apply stealth plugin
puppeteer.use(StealthPlugin());





// ========================================================================================================
// ========================================================================================================
// Wrapper function to to scrape the basic (meta-) data of a single Article, from an Article's page
// It calls the scrapeMediumArticle() function
// It also uses the outer helper functions: extractFirstPathPart and formatDate
// ========================================================================================================
// ========================================================================================================

export async function scrapeArticleBasic(url: string): Promise<PostData> {
  // Connect to an already running Chrome instance with remote debugging enabled
  const browser = await puppeteer.connect({
    browserURL: BROWSER_URLPORT,
    defaultViewport: null,
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    const postData = await scrapeMediumArticle(page);
    postData.date = formatDate(postData.date);
    postData.pubauthorslug = extractFirstPathPart(
      new URL(postData.link).pathname
    );

    return postData;
  } catch (error) {
    let msg: string = ('ERROR accessing the URL/page: ' +
      url +
      ' - ' +
      error) as string;
    const window = BrowserWindow.getAllWindows()[0]; // get first (or target) window
    window.webContents.send('message-channel', msg);
    throw error;
  } finally {
    await page.close();
    // Do NOT close the browser — we're just connected to it
  }
}

// ========================================================================================================
// ========================================================================================================
// Wrapper function to to scrape the Article data
// of all pages passed in using an array of urls
// It uses the key functions: 1. scrapeMediumArticle(), 2.scrapeMediumMarkdownContent()
//
// - Receives an array of URLs (string[])
// - Opens them as parallel tabs (Page instances)
// - For each, calls the scrapeMediumArticle()(page) function
// - Collects all results into an array of PostData[]
// ========================================================================================================
// ========================================================================================================

export async function collectPostsFromUrlTabs(
  urls: string[]
): Promise<PostData[]> {
  const browser = await puppeteer.connect({
    browserURL: BROWSER_URLPORT,
    defaultViewport: null,
  });


  const limit = pLimit(5); // lower concurrency due to shared profile

  try {
    let p = 0;
    const pagePromises = urls.map((url) =>
      limit(async () => {
        let page: Puppeteer.Page | undefined;

        try {
          // Optional delay to avoid rapid tab creation
          // await new Promise((res) => setTimeout(res, 500));
          await new Promise((res) => setTimeout(res, OPEN_NEW_TAB_DELAY));

          page = await browser.newPage();
          console.log(`Opening: ${url}`);
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: TAB_INITIAL_PAGE_LOADING_DELAY, //15000,   /****** */
          });

          // Scrape the article data by calling the scrapeMediumArticle() key-function
          const data = await scrapeMediumArticle(page);

          const content = await scrapeMediumMarkdownContent(page);
          data.content = content;

          data.counter = p;
          // console.log(` >===>> Post: ${p} ${JSON.stringify(data)} `);
          return data;
        } catch (err) {
          // console.error(`Failed to scrape ${url}:`, err.message || err);
          if (err instanceof Error) {
            console.error(`Failed to scrape ${url}:`, err.message);
          } else {
            console.error(`Failed to scrape ${url}:`, err);
          }
          return null;
        } finally {
          if (page && !page.isClosed()) {
            try {
              await page.close();
            } catch (closeErr) {
              // console.warn(
              //   `Error closing page for ${url}:`,
              //   closeErr.message || closeErr
              // );
              if (closeErr instanceof Error) {
                console.warn(
                  `Error closing page for ${url}:`,
                  closeErr.message
                );
              } else {
                console.warn(`Error closing page for ${url}:`, closeErr);
              }
            }
          }
        }
      })
    );

    // const results = await Promise.all(pagePromises);
    // results.filter((r): r is PostData => r !== null);
    let results = await Promise.all(pagePromises);
    results = results.filter((r): r is PostData => r !== null);

    let retPosts = results as PostData[];
    console.log('>===> Total Number of tried Posts: ', retPosts.length);
    let i = 0;
    for (const post of retPosts) {
      if (post) {
        i = i + 1;
        post.counter = i;
        if (post.date && post.date.length) {
          post.date = formatDate(post.date);
        }
      }
    }
    console.log('>===> Total Number of fetched Posts: ', i);

    return retPosts; // results.filter((r): r is PostData => r !== null);
  } finally {
    // DO NOT close the browser here — you're connected to an external instance
  }
}

// ==========================================================================================
// Key Function to scrape the basic (meta-) data of an Article, from an Article's page
// ==========================================================================================
async function scrapeMediumArticle(page: Puppeteer.Page): Promise<PostData> {
  
  
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );
  
  // await new Promise((resolve) => setTimeout(resolve, 1000));
  await new Promise((resolve) => setTimeout(resolve, ADDITIONAL_PAGE_DELAY)); // 1000 ms delay for additional page loading

  // Cloudflare challenge detection
  const challenge = await page.evaluate(() =>
    document.body.innerText.includes('Verify you are human')
  );
  if (challenge) {
    throw new Error('Blocked by bot protection (Cloudflare challenge)');
  }

  // Scraping Basic Article Data
  // We use the page.evaluate() function to run the code in the browser context
  // This allows us to access the DOM and extract the required data
  const postData = await page.evaluate(() => {
    const link = window.location.href;
    const hostname = new URL(link).hostname;
    const pubauthorslug = ''; //extractFirstPathPart(new URL(link).pathname);
    const pubEl = document.querySelector('h2 > div');
    const pubname = pubEl && pubEl.textContent ? pubEl.textContent.trim() : '';
    const titleEl = document.querySelector('h1[data-testid="storyTitle"]');
    let title =
      titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
    // If empty, fallback to the page <title> tag
    if (!title) {
      title = document.title ? document.title.trim() : '';
    }
    const imgEl = document.querySelector('figure img');
    const image = imgEl ? imgEl.getAttribute('src') || '' : '';
    const authorEl = document.querySelector('a[data-testid="authorName"]');
    const authorname =
      authorEl && authorEl.textContent ? authorEl.textContent.trim() : '';

    let rawDate = '';

    //250806 Update
    const outerContainer = document.querySelector('div.speechify-ignore.bh.m');
    if (outerContainer) {
      const dateContainer = outerContainer.querySelector('div.ac.af');
      if (dateContainer) {
        const childNodes = Array.from(dateContainer.childNodes);
        for (let i = childNodes.length - 1; i >= 0; i--) {
          const node = childNodes[i];

          // If it's an element, try to get its text
          if (node.nodeType === Node.ELEMENT_NODE) {
            const text = node.textContent?.trim() || '';
            if (text && text !== '·' && !/min read/i.test(text)) {
              rawDate = text;
              break;
            }
          }

          // If it's a text node, read it directly
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim() || '';
            if (text && text !== '·') {
              rawDate = text;
              break;
            }
          }
        }
      }
    }

    // console.log('>===>> Extracted date:', rawDate); // console.log does not work here due to the Puppeteer context

    const likesBtn = document.querySelector('.pw-multi-vote-count button');
    let likes = 0;
    if (likesBtn) {
      const likesText = (likesBtn.textContent ?? '').trim();
      likes = parseInt(likesText.replace(/\D/g, ''), 10) || 0;
    }

    const commentsEl = document.querySelector(
      'button[aria-label="responses"] .pw-responses-count'
    );
    let comments = 0;
    if (commentsEl) {
      const commentsText = commentsEl.textContent
        ? commentsEl.textContent.trim()
        : '';
      comments = parseInt(commentsText.replace(/\D/g, ''), 10) || 0;
    }

    const timestamp = new Date().toISOString();
    const counter = 0;
    const listname = '';
    const content = ''; // Placeholder for content, markdown obtained later

    return {
      counter,
      hostname,
      listname,
      pubauthorslug,
      timestamp,
      link,
      title,
      image,
      pubname,
      authorname,
      date: rawDate,
      likes,
      comments,
      content,
    };
  });

  return postData;
}

// ==========================================================================================
// 250808
// Function to scrape the Markdown content of a Medium article
// It calls the helper functons: 1.getCleanedPageContent() 2.processGists()
// It returns the Markdown content as a string
// ==========================================================================================
async function scrapeMediumMarkdownContent(
  page: Puppeteer.Page
): Promise<string> {
  // Not recommended: relies on internal structure
  // This is not officially supported and may break with future Puppeteer versions
  const browser = page.browserContext().browser();

  // console.log('>= *** ==>> scrapeMediumMarkdownContent() - before getCleanedPageContent(), page: ', page);

  try {
    // Get cleaned HTML + captured gist iframe sources
    const { html: cleanedHtml, iframeSrcs } = await getCleanedPageContent(page);

    // console.log('>= *** ==>> scrapeMediumMarkdownContent() - after getCleanedPageContent() 🔍 Cleaned HTML: ', cleanedHtml);

    // Process gists using existing browser connection
    const htmlWithGists = await processGists(browser, cleanedHtml, iframeSrcs);

    const turndownService = new TurndownService({
      codeBlockStyle: 'fenced',
      headingStyle: 'atx',
    });

    // Add your custom rules
    turndownService.addRule('fencedCodeBlocks', fencedCodeBlockRule());
    turndownService.addRule('inlineCode', inlineCodeRule());
    turndownService.addRule(
      'mediumFriendlyCodeBlocks',
      mediumFriendlyCodeBlockRule()
    );

    // Real convertion from HTML to Markdown
    return turndownService.turndown(htmlWithGists);
  } catch (error) {
    console.error('Error scraping Markdown content:', error);
    throw error;
  } finally {
    // if (page) {
    //   await page.close();
    // }
    // Don't close browser, since you're attaching to a running instance
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
// getCleanedPageContent() - Helper function that cleans unnecessary content
// ------------------------------------------------------------------------------------------------------------------------------------------------------------
// Returns the page content:
// Starts from the main <h1> with data-testid="storyTitle" instead of the entire <body>.
// Still removes scripts, styles, noscript, iframe tags for safety.
// Has a fallback if the storyTitle isn’t found (will just behave like your original code).
// Removes any elements containing the text "Zoom image will be displayed" before returning the cleaned HTML.
// Keeps the first <h1> as is (the main title) and converts all other <h1> elements into <h2> so they appear as proper subheadings in the Markdown output.
// Removes the div element, with an attributethat starts with "speechify-ignore", and is placed after the h1 Article Title
// Extracts separately iframe src URLs for Gists
// Returns both the cleaned HTML and the list of iframe sources
//
// Updated: 250830
// If iframe tags that concern YouTube videos, are found, they are replaced by a div with an anchor a element, which has as href the youtube video link, 
// and text the title of the video, extracted from the iframe tag's title attribute.
// •	Detects Embedly YouTube iframes via schema=youtube and pulls the real video URL from the url query param (already decoded).
// •	Fallbacks to direct youtube.com/embed/... iframes by converting to a watch?v= URL.
// •	Replaces matches with:
// •	<div class="youtube-video">
// •	  <a href="https://www.youtube.com/watch?v=VIDEO_ID" target="_blank" rel="noopener">Title from iframe</a>
// •	</div>
// •	Removes all other iframes to keep your output clean (you can tweak this if you want to keep certain providers).
// ------------------------------------------------------------------------------------------------------------------------------------------------------------

// export async function getCleanedPageContent(
//   page: import('puppeteer').Page
// ): Promise<{ html: string; iframeSrcs: string[] }> {
//   await autoScrollArticlePage(page);

//   try {
//     // await page.waitForSelector("figure iframe", { timeout: 5000 });
//     await page.waitForSelector('figure iframe', {
//       timeout: AFTER_AUTOSCROLL_GIST_IFRAME_SELECTOR_DELAY,  // 1000 ms
//     });
//   } catch {
//     console.warn('>= *** ==>> ⚠️ No gist iframes found within timeout');
//   }

//   const iframeSources: string[] = await page.evaluate(() => {
//     return Array.from(document.querySelectorAll('figure iframe'))
//       .map((iframe) => iframe.getAttribute('src') || '')
//       .filter(Boolean);
//   });

//   console.log('>= *** ==>> 📌 Found gist iframe src:', iframeSources);

//   const rawHTML = await page.evaluate(() => {
//     // const removeSpecificText = (root: HTMLElement, textToRemove: string) => {
//     // Instead of removing just a single text, we can remove multiple texts in an array
//     const removeSpecificText = (root: HTMLElement, textsToRemove: string[]) => {
//       root.querySelectorAll('*').forEach((el) => {
//         el.childNodes.forEach((node) => {
//           if (node.nodeType === Node.TEXT_NODE) {
//             const text = node.textContent?.trim() || '';
//             if (textsToRemove.includes(text)) {
//               node.textContent = '';
//             }
//           }
//         });
//       });
//       // Also remove elements that contain only any text specified in textsToRemove array
//       textsToRemove.forEach((t) => {
//         root.querySelectorAll('*').forEach((el) => {
//           if (el.textContent?.trim() === t) {
//             el.remove();
//           }
//         });
//       });
//     };

//     const removeSpeechifyIgnoreDivs = (root: HTMLElement) => {
//       root
//         .querySelectorAll('div[class^="speechify-ignore"]')
//         .forEach((el) => el.remove());
//     };

//     const fixHeadings = (root: HTMLElement) => {
//       const h1s = root.querySelectorAll('h1');
//       let firstFound = false;
//       h1s.forEach((h1) => {
//         if (!firstFound) {
//           firstFound = true;
//         } else {
//           const h2 = document.createElement('h2');
//           h2.innerHTML = h1.innerHTML;
//           h1.replaceWith(h2);
//         }
//       });
//     };

//     const removeContentBeforeFirstHeading = (root: HTMLElement) => {
//       const firstHeading = root.querySelector('h1');
//       if (firstHeading) {
//         let prev = firstHeading.previousSibling;
//         while (prev) {
//           const toRemove = prev;
//           prev = prev.previousSibling;
//           toRemove?.parentNode?.removeChild(toRemove);
//         }
//       }
//     };

//     const titleEl = document.querySelector('h1[data-testid="storyTitle"]');
//     let container: HTMLElement;

//     if (!titleEl) {
//       container = document.body.cloneNode(true) as HTMLElement;
//     } else {
//       let articleContainer: HTMLElement | null =
//         titleEl.closest('article') ||
//         titleEl.closest('section') ||
//         titleEl.closest('main') ||
//         document.body;
//       container = articleContainer.cloneNode(true) as HTMLElement;
//     }

//     container
//       .querySelectorAll('script, style, noscript')
//       .forEach((el) => el.remove());

//     // removeSpecificText(container, 'Zoom image will be displayed');
//     // Specify the array of multiple texts to remove
//     removeSpecificText(container, [
//       'Zoom image will be displayed',
//       'Press enter or click to view image in full size'
//     ]);

//     removeContentBeforeFirstHeading(container);
//     removeSpeechifyIgnoreDivs(container);
//     fixHeadings(container);

//     return container.innerHTML;
//   });

//   return { html: rawHTML, iframeSrcs: iframeSources };
// }

export async function getCleanedPageContent(
  page: import('puppeteer').Page
): Promise<{ html: string; iframeSrcs: string[] }> {
  await autoScrollArticlePage(page);

  try {
    await page.waitForSelector('figure iframe', {
      timeout: AFTER_AUTOSCROLL_GIST_IFRAME_SELECTOR_DELAY, // 1000 ms
    });
  } catch {
    // console.warn('>= *** ==>> ⚠️ No gist iframes found within timeout');
  }

  const iframeSources: string[] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('figure iframe'))
      .map((iframe) => iframe.getAttribute('src') || '')
      .filter(Boolean);
  });

  console.log('>= *** ==>> 📌 Found gist iframe src:', iframeSources);

  const rawHTML = await page.evaluate(() => {
    // --- helpers -------------------------------------------------------------

    const removeSpecificText = (root: HTMLElement, textsToRemove: string[]) => {
      root.querySelectorAll('*').forEach((el) => {
        el.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim() || '';
            if (textsToRemove.includes(text)) node.textContent = '';
          }
        });
      });
      textsToRemove.forEach((t) => {
        root.querySelectorAll('*').forEach((el) => {
          if (el.textContent?.trim() === t) el.remove();
        });
      });
    };

    const removeSpeechifyIgnoreDivs = (root: HTMLElement) => {
      root
        .querySelectorAll('div[class^="speechify-ignore"]')
        .forEach((el) => el.remove());
    };

    const fixHeadings = (root: HTMLElement) => {
      const h1s = root.querySelectorAll('h1');
      let firstFound = false;
      h1s.forEach((h1) => {
        if (!firstFound) {
          firstFound = true;
        } else {
          const h2 = document.createElement('h2');
          h2.innerHTML = h1.innerHTML;
          h1.replaceWith(h2);
        }
      });
    };

    const removeContentBeforeFirstHeading = (root: HTMLElement) => {
      const firstHeading = root.querySelector('h1');
      if (firstHeading) {
        let prev = firstHeading.previousSibling;
        while (prev) {
          const toRemove = prev;
          prev = prev.previousSibling;
          toRemove?.parentNode?.removeChild(toRemove);
        }
      }
    };

    // ⬇️ NEW: transform YouTube iframes into simple links, remove all others
    const transformYouTubeIframes = (root: HTMLElement) => {
      const iframes = Array.from(root.querySelectorAll('iframe'));

      for (const iframe of iframes) {
        const src = iframe.getAttribute('src') || '';
        let youtubeUrl: string | null = null;

        try {
          const u = new URL(src, location.href);
          const schema = u.searchParams.get('schema');
          const urlParam = u.searchParams.get('url'); // embedly provides the real URL here

          if (schema === 'youtube' && urlParam) {
            // URLSearchParams already decodes percent-encoding; double-decoding is safe-guarded
            youtubeUrl = decodeURIComponent(urlParam);
          } else if (/youtube\.com\/embed\//i.test(src)) {
            // Fallback for direct embed srcs without embedly
            const id = src.match(/embed\/([^?&]+)/)?.[1];
            if (id) youtubeUrl = `https://www.youtube.com/watch?v=${id}`;
          }
        } catch {
          // ignore parse errors and treat as non-YouTube
        }

        if (youtubeUrl) {
          const title =
            iframe.getAttribute('title')?.trim() ||
            'YouTube video';

          const wrapper = document.createElement('div');
          wrapper.className = 'youtube-video';

          const a = document.createElement('a');
          a.href = youtubeUrl;
          a.textContent = title;
          a.target = '_blank';
          a.rel = 'noopener';

          wrapper.appendChild(a);
          iframe.replaceWith(wrapper);
        } else {
          // Not YouTube → drop the iframe entirely (since you consider iframes unwanted)
          iframe.remove();
        }
      }
    };

    // --- scope target --------------------------------------------------------

    const titleEl = document.querySelector('h1[data-testid="storyTitle"]');
    let container: HTMLElement;

    if (!titleEl) {
      container = document.body.cloneNode(true) as HTMLElement;
    } else {
      const articleContainer: HTMLElement | null =
        titleEl.closest('article') ||
        titleEl.closest('section') ||
        titleEl.closest('main') ||
        document.body;
      container = articleContainer.cloneNode(true) as HTMLElement;
    }

    // --- clean & transform ---------------------------------------------------

    container
      .querySelectorAll('script, style, noscript')
      .forEach((el) => el.remove());

    removeSpecificText(container, [
      'Zoom image will be displayed',
      'Press enter or click to view image in full size',
    ]);

    removeContentBeforeFirstHeading(container);
    removeSpeechifyIgnoreDivs(container);
    fixHeadings(container);

    // ⬅️ call the new transformer here
    transformYouTubeIframes(container);

    return container.innerHTML;
  });

  return { html: rawHTML, iframeSrcs: iframeSources };
}







// ------------------------------------------------------------------------------------------------------------------------------------------------------------
// processGists() - Helper function that finds the gist-met
// ------------------------------------------------------------------------------------------------------------------------------------------------------------
// Returns the page content:
// Finds all .gist-meta divs.
// For each one:
//     Extracts the raw code URL (first <a> tag’s href).
//     Extracts the Gist permalink (second <a> tag’s href).
//     Fetches the raw code directly from GitHub (inside Puppeteer via fetch()).
//     Creates a clean <pre><code> block with the fetched code.
//     Appends a small <p> after it with the permalink.
// Replaces the original table + .gist-meta with our cleaned <pre><code> + link.
// ------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function processGists(
  browser: Puppeteer.Browser,
  html: string,
  iframeSrcs: string[]
): Promise<string> {
  console.log('🔍 Processing gists...');
  console.log('📌 Captured iframe sources:', iframeSrcs);

  const dom = new JSDOM(html);
  const document = dom.window.document;

  // --- 1️⃣ Process .gist-meta blocks ---
  const gistBlocks = document.querySelectorAll('.gist-meta');
  if (gistBlocks.length > 0) {
    console.log(`📌 Found ${gistBlocks.length} gist-meta blocks`);
    for (const gistMeta of gistBlocks) {
      const links = gistMeta.querySelectorAll('a');
      if (links.length >= 2) {
        const rawCodeUrl = links[0].getAttribute('href') || '';
        const gistPermalink = links[1].getAttribute('href') || '';

        if (rawCodeUrl) {
          try {
            const response = await fetch(rawCodeUrl);
            const codeText = await response.text();

            // Create code block
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = codeText;
            pre.appendChild(code);

            // Create gist link
            const linkPara = document.createElement('p');
            linkPara.textContent = `Gist Link: ${gistPermalink}`;

            // Replace gist-meta with code + link
            gistMeta.previousElementSibling?.remove();
            gistMeta.replaceWith(pre, linkPara);
          } catch (err) {
            console.warn('⚠️ Failed to fetch gist code:', rawCodeUrl, err);
          }
        }
      }
    }
  }

  // --- 2️⃣ Process iframe-based gists ---
  if (iframeSrcs.length > 0) {
    console.log(
      `📌 Processing ${iframeSrcs.length} iframe-based gist embeds...`
    );

    const figures = Array.from(document.querySelectorAll('figure iframe')).map(
      (iframe) => iframe.closest('figure')
    );

    for (let i = 0; i < iframeSrcs.length; i++) {
      const iframeUrl = iframeSrcs[i];
      if (!iframeUrl) continue;

      try {
        const gistData = await extractCodeFromIframe(browser, iframeUrl);
        if (!gistData?.code) {
          console.warn(`⚠️ Could not extract code from ${iframeUrl}`);
          continue;
        }

        // Create code block
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = gistData.code;
        pre.appendChild(code);

        // Create gist link (only if available)
        let linkPara: HTMLParagraphElement | null = null;
        if (gistData.gistPermalink) {
          const i = gistData.gistPermalink.lastIndexOf('/raw');
          const gistLink =
            i > 0 ? gistData.gistPermalink.slice(0, i) : gistData.gistPermalink;
          linkPara = document.createElement('p');
          // linkPara.textContent = `Gist Link: ${gistData.gistPermalink}`;
          linkPara.textContent = `[ Gist Link: ${gistLink} ]`;
        }

        // Replace figure with both elements
        if (figures[i]) {
          if (linkPara) {
            figures[i]?.replaceWith(pre, linkPara);
          } else {
            figures[i]?.replaceWith(pre);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Failed to process iframe gist: ${iframeUrl}`, err);
      }
    }
  }

  return document.body.innerHTML;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
// extractCodeFromIframe() - Helper function that opens and obtains Gist code blocks
// ------------------------------------------------------------------------------------------------------------------------------------------------------------
// Extracts raw code from a Gist iframe using an existing Puppeteer browser instance.
//
//
// ------------------------------------------------------------------------------------------------------------------------------------------------------------
export async function extractCodeFromIframe(
  browser: Puppeteer.Browser,
  iframeUrl: string
): Promise<{ code: string; gistPermalink?: string } | null> {
  const page = await browser.newPage();

  try {
    // await page.goto(iframeUrl, { waitUntil: "networkidle0", timeout: 20000 });
    await page.goto(iframeUrl, {
      waitUntil: 'networkidle0',
      timeout: GIST_PAGE_LOADING_DELAY,  //******/
    });

    // Find the raw code link
    const { rawCodeUrl, gistPermalink } = await page.evaluate(() => {
      const rawLink = document.querySelector<HTMLAnchorElement>(
        '.gist-meta a[href*="/raw"]'
      );
      const permalinkLink = document.querySelector<HTMLAnchorElement>(
        '.gist-meta a[href^="https://gist.github.com"]'
      );

      return {
        rawCodeUrl: rawLink?.href || null,
        gistPermalink: permalinkLink?.href || null,
      };
    });

    if (!rawCodeUrl) {
      console.warn(`⚠️ No raw code link found inside iframe: ${iframeUrl}`);
      return null;
    }

    // Fetch the raw code directly (no HTML parsing!)
    const res = await fetch(rawCodeUrl);
    const codeText = await res.text();

    return { code: codeText, gistPermalink: gistPermalink ?? undefined };
  } catch (err) {
    console.error(`❌ Failed to extract gist from iframe: ${iframeUrl}`, err);
    return null;
  } finally {
    await page.close();
  }
}

// ==========================================================================================
// ==========================================================================================
// Wrapper function: scrapeList to to scrape a Medium List
// It calls the key function: scrapeMediumList
// It uses the inner helper function: autoScrollToEnd
// It also uses the outer helper functions: extractFirstPathPart and formatDate
// ==========================================================================================
// ==========================================================================================

export async function scrapeList(url: string): Promise<PostData[]> {
  console.log(
    'scrape-functions ->  scrapeList() started .... target URL: ',
    url
  );

  // Connect to an already running Chrome instance with remote debugging enabled
  const browser = await puppeteer.connect({
    browserURL: BROWSER_URLPORT,
    defaultViewport: null,
  });

  if (browser)
    console.log(
      'scrape-functions ->  scrapeList() - Connected to Browser! ',
      url
    );

  const page = await browser.newPage();

  try {
    console.log(
      'scrape-functions ->  scrapeList() - trying to go to page: ',
      url
    );
    await page.goto(url, { waitUntil: 'networkidle2' });

    const totalArticles = await autoScrollToEnd(
      page,
      MAX_ARTICLES_NUMBER,
      SCROLL_DELAY
    );

    const scrapedData = await scrapeMediumList(page);
    // We update here the gathered data, since in Puppeteer, we can not use outter functions
    for (const item of scrapedData) {
      item.date = formatDate(item.date);
      item.pubauthorslug = extractFirstPathPart(new URL(item.link).pathname);
    }

    return scrapedData;
  } catch (error) {
    throw error;
  } finally {
    await page.close();
    // Do NOT close the browser — we're just connected to it
  }
}

// ==========================================================================================
// Key Function to scrape a Medium List -
// It scrapes the basic meta-data of each Article from a Medium List
// ==========================================================================================
async function scrapeMediumList(page: Puppeteer.Page): Promise<PostData[]> {
  console.log(
    'scrape-functions ->  scrapeMediumList() started .... for page: ',
    page.url.toString
  );

  return await page.evaluate(() => {
    // Extract listname and timestamp
    const listnameEl = document.querySelector('h1');
    const rawlistname = listnameEl
      ? listnameEl.innerText.trim()
      : document.title.trim();
    const listname = rawlistname
      .replace(/^List:\s*/, '')
      .split('|')[0]
      .trim();
    const timestamp = new Date().toISOString();

    const posts = Array.from(document.querySelectorAll('article'));

    // *** Iterate through the displayed list posts ***
    const results: PostData[] = posts.map((post, index) => {
      // Extract title and link
      const titleEl = post.querySelector('h2');
      const titleLinkEl = titleEl ? titleEl.closest('a') : null;
      const title = titleEl ? titleEl.innerText.trim() : 'No title';
      const link = titleLinkEl ? titleLinkEl.href.split('?')[0] : 'No link';
      const hostname = new URL(link).hostname;
      const pubauthorslug = ''; //extractFirstPathPart(new URL(link).pathname);

      // Extract image
      const imgEls = post.querySelectorAll('img');
      let image = 'No image';
      if (imgEls.length > 0) {
        const largestImg = Array.from(imgEls).reduce((max, img) => {
          const width = parseInt(img.getAttribute('width') || '0', 10);
          return width > parseInt(max.getAttribute('width') || '0', 10)
            ? img
            : max;
        });
        image = largestImg.src.replace(/\/resize:[^/]+\//, '/');
      }

      // Extract date (raw date), likes, comments, pubname, and authorname
      const infoEl = post.querySelector('span:has(svg[width="16"])');
      let rawDate = '',
        date = '',
        likes = 0,
        comments = 0;

      if (infoEl) {
        // const parts = infoEl.innerText.trim().split('\n').map(s => s.trim());
        const parts = (infoEl as HTMLElement).innerText
          .trim()
          .split('\n')
          .map((s: string) => s.trim());

        rawDate = parts[0] || '';
        likes = parts[1] ? parseInt(parts[1], 10) || 0 : 0;
        comments = parts[2] ? parseInt(parts[2], 10) || 0 : 0;
        // date = formatDate(rawDate);
        date = rawDate;
      }

      // Extract pubname and authorname
      const pubNameEl = post.querySelector('div a[href*="medium.com"] p');
      const authorNameEl = post.querySelector('div a[href^="/@"] p');
      const pubname = pubNameEl
        ? (pubNameEl as HTMLElement).innerText.trim()
        : '';
      const authorname = authorNameEl
        ? (authorNameEl as HTMLElement).innerText.trim()
        : '';

      const postData: PostData = {
        counter: index + 1,
        hostname,
        listname,
        pubauthorslug,
        timestamp,
        pubname,
        authorname,
        title,
        link,
        image,
        date,
        likes,
        comments,
      };

      return postData;
    });

    return results;
  });
}



// -----------------------------------------------------------------------------------------
/*
 * 250731 
 * Helper function to automatically scroll a Medium article page
 * to the bottom to trigger lazy-loading of content.
 * It automatically scrolls the page to the bottom to trigger lazy-loading
 * It uses the Puppeteer Page instance to scroll down by a specified distance
 * at regular intervals until the end of the page is reached.
 * It can be used to ensure all content is loaded before scraping.
 * Parameters:
 * @param page Puppeteer Page instance
 * @param distance Pixels to scroll each step
 * @param delay Delay (ms) between each scroll step
 */
export async function autoScrollArticlePage(
  page: import('puppeteer').Page,
  distance = 200,
  delay = DEFAULT_AUTOSCROLL_DELAY //100
): Promise<void> {
  await page.evaluate(
    async (scrollDistance: number, stepDelay: number) => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const timer = setInterval(() => {
          const { scrollHeight } = document.body;
          window.scrollBy(0, scrollDistance);
          totalHeight += scrollDistance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, stepDelay);
      });
    },
    distance,
    delay
  );
}


// -----------------------------------------------------------------------------------------
// Helper function to automatically scroll to the end of the Medium List page
// until a specified number of articles is reached or no new articles are loaded
// Returns the total number of articles found
// -----------------------------------------------------------------------------------------
async function autoScrollToEnd(
  page: Puppeteer.Page,
  maxArticles: number,
  scrollDelay: number
): Promise<number> {
  let lastCount = await page.$$eval('article', (arts) => arts.length);
  let attemptsWithoutNew = 0;
  const maxAttempts = 5;
  let scrolls = 0;

  while (attemptsWithoutNew < maxAttempts) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(scrollDelay);

    const currentCount = await page.$$eval('article', (arts) => arts.length);
    if (currentCount > lastCount) {
      console.log(
        `🆕 Scroll ${scrolls + 1}: Loaded ${
          currentCount - lastCount
        } new articles (Total: ${currentCount})`
      );
      lastCount = currentCount;
      attemptsWithoutNew = 0;
      scrolls++;
    } else {
      attemptsWithoutNew++;
      console.log(
        `⚠️ No new articles, attempt ${attemptsWithoutNew}/${maxAttempts}`
      );
    }
    if (currentCount >= maxArticles) break;
  }

  console.log(
    `✅ Final summary: ${scrolls} scrolls made, ${lastCount} articles found.`
  );
  return lastCount;
}

// Helper function to pause
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}










// -----------------------------------------------------------------------------------------
// Helper Function to wait for user input
// It prompts the user to press ENTER to continue
// -----------------------------------------------------------------------------------------
// export async function waitForEnter(): Promise<void> {
//   return new Promise((resolve) => {
//     const rl = readline.createInterface({
//       input: process.stdin,
//       output: process.stdout,
//     });
//     rl.question("⏸️  Press ENTER to continue...\n", () => {
//       rl.close();
//       resolve();
//     });
//   });
// }

// -----------------------------------------------------------------------------------------
// Helper function to click an element with retry logic
// It attempts to click the element a specified number of times
// If it fails, it waits and retries
// Returns true if the click was successful, false otherwise
// -----------------------------------------------------------------------------------------
async function clickWithRetry(
  element: Puppeteer.ElementHandle,
  retries: number
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await element.click();
      await sleep(300);
      return true;
    } catch (err) {
      console.warn(`⚠️ Attempt ${attempt} failed: ${(err as Error).message}`);
      await sleep(500);
    }
  }
  return false;
}
