// page-converters.ts
// This file is part of an Electron application that converts an article HTML page to Markdown text, for a givven URL.
// 250729 - 250801 - 

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import TurndownService from 'turndown';

import { BROWSER_URLPORT } from '../../../shared/constants';
import { Browser, Page } from 'puppeteer';

import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

import { autoScrollArticlePage } from '../scrappers/scrape-functions';
import { fencedCodeBlockRule, inlineCodeRule, mediumFriendlyCodeBlockRule } from '../../helpers/turndown-rules';
import { GIST_IFRAME_SELECTOR_DELAY, GIST_PAGE_LOADING_DELAY, INITIAL_PAGE_LOADING_DELAY, SLEEP_DELAY_FOR_LATE_JS_RENDERING } from './time-constants';

puppeteer.use(StealthPlugin());



// ========================================================================================================
// Timer Constants
// ========================================================================================================
// const INITIAL_PAGE_LOADING_DELAY = 15000;         // 15 (20) seconds for page load  (htmlToMarkdown)
// const SLEEP_DELAY_FOR_LATE_JS_RENDERING = 1000;   // 1 second for late JS rendering  (htmlToMarkdown)
// const GIST_IFRAME_SELECTOR_DELAY = 5000;          // 5 seconds to wait for gist iframes to appear  (getCleanedPageContent)
// const GIST_PAGE_LOADING_DELAY = 15000;            // 15 (20) seconds for gist page load  (extractCodeFromIframe)







// ========================================================================================================
// ========================================================================================================
// htmlToMarkdown()
// The main function that converts an article HTML page to Markdown text, for a givven URL
//
// ========================================================================================================
// ========================================================================================================
/**
 * Converts a webpage (or raw HTML string) to Markdown.
 * @param input A URL or raw HTML string.
 * @param isRawHtml Whether the input is raw HTML (true) or a URL (false).
 * @returns The resulting Markdown string.
 */

export async function htmlToMarkdown(
  input: string,
  isRawHtml: boolean
): Promise<string> {
  // Attach to an existing browser instance
  const browser = await puppeteer.connect({
    browserURL: BROWSER_URLPORT,
    defaultViewport: null,
  });

  let page: Page | null = null;

  try {
    page = await browser.newPage();

    // Pretend to be a real browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    );

    if (isRawHtml) {
      await page.goto(
        `data:text/html;charset=utf-8,${encodeURIComponent(input)}`,
        { waitUntil: 'networkidle0' }
      );
    } else {
      // await page.goto(input, { waitUntil: 'networkidle0', timeout: 20000 });
      await page.goto(input, {
        waitUntil: 'networkidle0',
        timeout: INITIAL_PAGE_LOADING_DELAY,
      });
    }



    // Small delay for late JS rendering
    // await new Promise((res) => setTimeout(res, 1000));
    await new Promise((res) =>
      setTimeout(res, SLEEP_DELAY_FOR_LATE_JS_RENDERING)
    );

    // Cloudflare challenge detection
    const challenge = await page.evaluate(() =>
      document.body.innerText.includes('Verify you are human')
    );
    if (challenge) {
      throw new Error('Blocked by bot protection (Cloudflare challenge)');
    }



    // 1️⃣ Get cleaned HTML + captured gist iframe sources
    const { html: cleanedHtml, iframeSrcs } = await getCleanedPageContent(page);

    // 2️⃣ Process gists using existing browser connection
    const htmlWithGists = await processGists(browser, cleanedHtml, iframeSrcs);

    // 3️⃣ Convert processed HTML to Markdown
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

    return turndownService.turndown(htmlWithGists);
  } finally {
    if (page) {
      await page.close();
    }
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
// ------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function getCleanedPageContent(
  page: import("puppeteer").Page
): Promise<{ html: string; iframeSrcs: string[] }> {
  await autoScrollArticlePage(page);

  try {
    // await page.waitForSelector("figure iframe", { timeout: 5000 });
    await page.waitForSelector("figure iframe", {
      timeout: GIST_IFRAME_SELECTOR_DELAY,
    });
  } catch {
    console.warn("⚠️ No gist iframes found within timeout");
  }

  const iframeSources: string[] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("figure iframe"))
      .map((iframe) => iframe.getAttribute("src") || "")
      .filter(Boolean);
  });

  console.log("📌 Found gist iframe src:", iframeSources);

  const rawHTML = await page.evaluate(() => {
    const removeSpecificText = (root: HTMLElement, textToRemove: string) => {
      root.querySelectorAll("*").forEach((el) => {
        el.childNodes.forEach((node) => {
          if (
            node.nodeType === Node.TEXT_NODE &&
            node.textContent?.trim() === textToRemove
          ) {
            node.textContent = "";
          }
        });
      });
    };

    const removeSpeechifyIgnoreDivs = (root: HTMLElement) => {
      root
        .querySelectorAll('div[class^="speechify-ignore"]')
        .forEach((el) => el.remove());
    };

    const fixHeadings = (root: HTMLElement) => {
      const h1s = root.querySelectorAll("h1");
      let firstFound = false;
      h1s.forEach((h1) => {
        if (!firstFound) {
          firstFound = true;
        } else {
          const h2 = document.createElement("h2");
          h2.innerHTML = h1.innerHTML;
          h1.replaceWith(h2);
        }
      });
    };

    const removeContentBeforeFirstHeading = (root: HTMLElement) => {
      const firstHeading = root.querySelector("h1");
      if (firstHeading) {
        let prev = firstHeading.previousSibling;
        while (prev) {
          const toRemove = prev;
          prev = prev.previousSibling;
          toRemove?.parentNode?.removeChild(toRemove);
        }
      }
    };

    const titleEl = document.querySelector('h1[data-testid="storyTitle"]');
    let container: HTMLElement;

    if (!titleEl) {
      container = document.body.cloneNode(true) as HTMLElement;
    } else {
      let articleContainer: HTMLElement | null =
        titleEl.closest("article") ||
        titleEl.closest("section") ||
        titleEl.closest("main") ||
        document.body;
      container = articleContainer.cloneNode(true) as HTMLElement;
    }

    container
      .querySelectorAll("script, style, noscript")
      .forEach((el) => el.remove());

    removeSpecificText(container, "Zoom image will be displayed");
    removeContentBeforeFirstHeading(container);
    removeSpeechifyIgnoreDivs(container);
    fixHeadings(container);

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
  browser: Browser,
  html: string,
  iframeSrcs: string[]
): Promise<string> {
  console.log("🔍 Processing gists...");
  console.log("📌 Captured iframe sources:", iframeSrcs);

  const dom = new JSDOM(html);
  const document = dom.window.document;

  // --- 1️⃣ Process .gist-meta blocks ---
  const gistBlocks = document.querySelectorAll(".gist-meta");
  if (gistBlocks.length > 0) {
    console.log(`📌 Found ${gistBlocks.length} gist-meta blocks`);
    for (const gistMeta of gistBlocks) {
      const links = gistMeta.querySelectorAll("a");
      if (links.length >= 2) {
        const rawCodeUrl = links[0].getAttribute("href") || "";
        const gistPermalink = links[1].getAttribute("href") || "";

        if (rawCodeUrl) {
          try {
            const response = await fetch(rawCodeUrl);
            const codeText = await response.text();

            // Create code block
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            code.textContent = codeText;
            pre.appendChild(code);

            // Create gist link
            const linkPara = document.createElement("p");
            linkPara.textContent = `Gist Link: ${gistPermalink}`;

            // Replace gist-meta with code + link
            gistMeta.previousElementSibling?.remove();
            gistMeta.replaceWith(pre, linkPara);
          } catch (err) {
            console.warn("⚠️ Failed to fetch gist code:", rawCodeUrl, err);
          }
        }
      }
    }
  }

  // --- 2️⃣ Process iframe-based gists ---
  if (iframeSrcs.length > 0) {
    console.log(`📌 Processing ${iframeSrcs.length} iframe-based gist embeds...`);

    const figures = Array.from(document.querySelectorAll("figure iframe")).map(
      (iframe) => iframe.closest("figure")
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
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = gistData.code;
        pre.appendChild(code);

        // Create gist link (only if available)
        let linkPara: HTMLParagraphElement | null = null;
        if (gistData.gistPermalink) {
          const i = gistData.gistPermalink.lastIndexOf('/raw');
          const gistLink =  i > 0 ? gistData.gistPermalink.slice(0, i) : gistData.gistPermalink;
          linkPara = document.createElement("p");
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
  browser: Browser,
  iframeUrl: string
): Promise<{ code: string; gistPermalink?: string } | null> {
  const page = await browser.newPage();

  try {
    // await page.goto(iframeUrl, { waitUntil: "networkidle0", timeout: 20000 });
    await page.goto(iframeUrl, {
      waitUntil: 'networkidle0',
      timeout: GIST_PAGE_LOADING_DELAY,
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
        gistPermalink: permalinkLink?.href || null
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








































