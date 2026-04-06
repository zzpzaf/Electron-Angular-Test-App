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

import { AsyncLocalStorage } from 'async_hooks';
import { PostData, ScrapeTabsOptions } from '../../../shared/projectObjects/varObjects';
import { formatDate } from '../../helpers/electron-utils';
import { extractFirstPathPart } from '../../../shared/utils/shared-utils';

import {
  BROWSER_URLPORT,
  timeConst,
  metaSEL,
  cleanSEL,
  iframeConst,
  iframeSEL,
  listSEL,
  mediumSEL,
} from './scrape-constants';
 

// ========================================================================================================

// Apply stealth plugin
puppeteer.use(StealthPlugin());

// 260330 Update: Per-article context store — survives async boundaries and parallel pLimit tasks
const _scrapeContextStorage = new AsyncLocalStorage<{ article: string }>();

type IframeEmbedType = 'gist' | 'stackademic' | 'datawrapper';

type IframeEmbed = {
  src: string;
  title: string;
  type: IframeEmbedType;
};

// 260328 Update: Adding logging for scrape timing
function logScrapeTiming(message: string): void {
  if (timeConst.ENABLE_SCRAPE_TIMING_LOGS) {
    console.log(`[scrape-timing] ${message}`);
  }
}

// 260328 Update: Adding structured logging for function headers, link scraping, and iterations
function logFunctionHeader(functionName: string): void {
  const divider = '='.repeat(90);
  console.log(divider);
  console.log(`[${functionName}]`);
  console.log(divider);
}

// 260328 Update: Logging for each scraped link in collectPostsFromUrlTabs
function logScrapeLinkStart(
  functionName: string,
  index: number,
  url: string,
  total?: number
): void {
  const divider = '-'.repeat(90);
  const seq = typeof total === 'number' ? `${index}/${total}` : `${index}`;
  console.log(divider);
  console.log(`[${functionName}] Scraping link ${seq}: ${url}`);
  console.log(divider);
}

// 260328 Update: Logging for iterations in functions like processGists
function logIterationHeader(
  functionName: string,
  index: number,
  total?: number,
  details?: string
): void {
  const divider = '-'.repeat(90);
  const seq = typeof total === 'number' ? `${index}/${total}` : `${index}`;
  console.log(divider);
  console.log(`[${functionName}] Iteration ${seq}${details ? ` | ${details}` : ''}`);
  console.log(divider);
}

function pickMainResponseHeaders(headers: Record<string, string>): Record<string, string> {
  const interestingHeaderNames = [
    'server',
    'via',
    'location',
    'content-type',
    'cache-control',
    'x-cache',
    'x-served-by',
    'cf-ray',
    'cf-cache-status',
    'x-frame-options',
    'retry-after',
  ];

  const picked = interestingHeaderNames.reduce<Record<string, string>>((acc, name) => {
    const value = headers[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      acc[name] = value;
    }
    return acc;
  }, {});

  return picked;
}

async function logHttp403Diagnostics(
  page: Puppeteer.Page,
  requestedUrl: string,
  navResponse?: Puppeteer.HTTPResponse | null
): Promise<void> {
  const finalUrl = navResponse?.url() || page.url();
  const status = navResponse?.status();
  const mainHeaders = pickMainResponseHeaders(navResponse?.headers() || {});

  const pageSignals = await page.evaluate(() => {
    const title = (document.title || '').replace(/\s+/g, ' ').trim();
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const bodySnippet = bodyText.slice(0, 500);
    const lowerTitle = title.toLowerCase();
    const lowerBody = bodyText.toLowerCase();

    const challengeMarkers = {
      hasJustAMomentTitle: lowerTitle.includes('just a moment'),
      hasEnableJsCookiesPrompt: lowerBody.includes('enable javascript and cookies to continue'),
      hasVerifyHumanPrompt: lowerBody.includes('verify you are human'),
      hasCloudflareMention: lowerBody.includes('cloudflare'),
      hasCloudflareChallengeScript: !!document.querySelector(
        'script[src*="/cdn-cgi/challenge-platform/"]'
      ),
      hasCaptchaInput: !!document.querySelector(
        'input[name*="captcha" i], iframe[src*="captcha" i], div[class*="captcha" i]'
      ),
    };

    return {
      title,
      bodySnippet,
      challengeMarkers,
    };
  });

  console.warn('------------------------------------------------------------------------------------------');
  console.warn('[scrape-403-diagnostics] HTTP 403 detected');
  console.warn(`[scrape-403-diagnostics] Requested URL: ${requestedUrl}`);
  console.warn(`[scrape-403-diagnostics] Final redirected URL: ${finalUrl}`);
  console.warn(`[scrape-403-diagnostics] Main response status: ${status ?? 'unknown'}`);
  console.warn(
    `[scrape-403-diagnostics] Main response headers: ${JSON.stringify(mainHeaders, null, 2)}`
  );
  console.warn(`[scrape-403-diagnostics] Title: ${pageSignals.title}`);
  console.warn(`[scrape-403-diagnostics] Body snippet: ${pageSignals.bodySnippet}`);
  console.warn(
    `[scrape-403-diagnostics] Challenge markers: ${JSON.stringify(
      pageSignals.challengeMarkers,
      null,
      2
    )}`
  );
  console.warn('------------------------------------------------------------------------------------------');
}

// 260328 Update: Wrapper function to measure and log the duration of async steps in scraping functions
async function measureScrapeStep<T>(
  label: string,
  action: () => T | Promise<T>,
  details?: string
): Promise<T> {
  const startedAt = Date.now();
  const ctx = _scrapeContextStorage.getStore();
  const articleTag = ctx ? ` | article=${ctx.article}` : '';
  const suffix = details ? ` | ${details}` : '';
  logScrapeTiming(`START ${label}${articleTag}${suffix}`);

  try {
    return await action();
  } finally {
    logScrapeTiming(`END ${label} | ${Date.now() - startedAt} ms${articleTag}${suffix}`);
  }
}

type ScrapeBrowserSession = {
  browser: Puppeteer.Browser;
  owned: boolean;
  mode: 'headless' | 'remote-debug';
};

// 260328 Update: Refactored browser connection into a separate function for reuse and better error handling
async function connectToBrowser(): Promise<ScrapeBrowserSession> {
  console.log(`[scraper] browser mode: ${timeConst.SCRAPE_BROWSER_MODE}`);
  if (timeConst.SCRAPE_BROWSER_MODE === 'headless') {
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: null,
      protocolTimeout: timeConst.PROTOCOL_TIMEOUT,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-backgrounding-occluded-windows',
      ],
    });

    return {
      browser,
      owned: true,
      mode: 'headless',
    };
  }

  const browser = await puppeteer.connect({
    browserURL: BROWSER_URLPORT,
    defaultViewport: null,
    protocolTimeout: timeConst.PROTOCOL_TIMEOUT,
  });

  return {
    browser,
    owned: false,
    mode: 'remote-debug',
  };
}

// Create tabs in background when possible to avoid stealing OS focus from the user's current app.
async function createScrapePage(browser: Puppeteer.Browser): Promise<Puppeteer.Page> {
  if (timeConst.SCRAPE_BROWSER_MODE === 'remote-debug') {
    // In attached mode, creating background targets concurrently can race and return unstable pages.
    return browser.newPage();
  }

  try {
    const browserTarget = browser.target();
    const session = await browserTarget.createCDPSession();
    const existingTargets = new Set(browser.targets());

    await session.send(
      'Target.createTarget' as never,
      { url: 'about:blank', background: true } as never
    );

    const target = await browser.waitForTarget(
      (candidate) => !existingTargets.has(candidate) && candidate.type() === 'page',
      { timeout: 3000 }
    );

    await session.detach();

    const page = await target.page();
    if (page) {
      return page;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logScrapeTiming(`createScrapePage fallback to browser.newPage | reason=${msg}`);
  }

  return browser.newPage();
}

function classifyIframeSource(src: string): IframeEmbedType | null {
  if (!src) return null;

  try {
    const u = new URL(src, 'https://medium.com');
    const hostname = u.hostname.toLowerCase();
    const pathname = u.pathname || '';
    const schema = (u.searchParams.get('schema') || '').toLowerCase();
    const urlParam = u.searchParams.get('url') || '';

    if (hostname === iframeConst.GIST_HOST || pathname.endsWith('.js')) {
      return 'gist';
    }

    if (
      hostname === iframeConst.STACKACADEMIC_HOST &&
      pathname.startsWith(iframeConst.STACKACADEMIC_MEDIA_PATH_PREFIX)
    ) {
      return 'stackademic';
    }

    if (hostname === iframeConst.DATAWRAPPER_HOST) {
      return 'datawrapper';
    }

    if ((schema === 'datawrapper' || schema === 'dwcdn') && urlParam) {
      const nested = new URL(urlParam, 'https://medium.com');
      if (nested.hostname.toLowerCase() === iframeConst.DATAWRAPPER_HOST) {
        return 'datawrapper';
      }
    }
  } catch {
    return null;
  }

  return null;
}

function resolveDatawrapperUrl(src: string): string {
  if (!src) return src;

  try {
    const u = new URL(src, 'https://medium.com');
    const hostname = u.hostname.toLowerCase();
    const schema = (u.searchParams.get('schema') || '').toLowerCase();
    const urlParam = u.searchParams.get('url') || '';

    if (hostname === iframeConst.DATAWRAPPER_HOST) {
      return u.toString();
    }

    if ((schema === 'dwcdn' || schema === 'datawrapper') && urlParam) {
      const nested = new URL(urlParam, 'https://medium.com');
      if (nested.hostname.toLowerCase() === iframeConst.DATAWRAPPER_HOST) {
        return nested.toString();
      }
    }
  } catch {
    return src;
  }

  return src;
}

function isMediumHostname(url: string, substring = 'medium'): boolean {
  const probe = (substring || 'medium').toLowerCase().trim();
  if (!probe) return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes(probe);
  } catch {
    return false;
  }
}

async function hasMediumHeaderLogo(page: Puppeteer.Page): Promise<boolean> {
  try {
    return await page.evaluate((SEL) => {
      return !!document.querySelector(SEL.headerLogoAnchor);
    }, mediumSEL);
  } catch {
    return false;
  }
}

async function hasMediumPlatformSignals(page: Puppeteer.Page): Promise<boolean> {
  try {
    return await page.evaluate((SEL) => {
      return !!document.querySelector(SEL.platformSignals);
    }, mediumSEL);
  } catch {
    return false;
  }
}

async function isMedium410LikePage(page: Puppeteer.Page): Promise<boolean> {
  try {
    return await page.evaluate((SEL) => {
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').toLowerCase();
      const titleText = (document.title || '').toLowerCase();

      const hasError410Signal =
        /\berror\b\s*\b410\b/.test(bodyText) ||
        /\b410\b/.test(titleText);

      const ctaAnchor = document.querySelector<HTMLAnchorElement>(SEL.error410CtaAnchor);
      const ctaText = (ctaAnchor?.textContent || '').trim().toLowerCase();
      const hasTakeMeToMediumCta = ctaText.includes('take me to medium');

      const hasKnownMedium410Text =
        bodyText.includes('under investigation') ||
        bodyText.includes('violation of the medium rules') ||
        bodyText.includes('there are thousands of stories to read on medium');

      return (
        (hasError410Signal && hasTakeMeToMediumCta) ||
        (hasError410Signal && hasKnownMedium410Text)
      );
    }, mediumSEL);
  } catch {
    return false;
  }
}

async function isChallengeOrBlockedPage(page: Puppeteer.Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').toLowerCase();
      const titleText = (document.title || '').toLowerCase();

      const hasJustAMoment = titleText.includes('just a moment');
      const hasJsCookiesPrompt =
        bodyText.includes('enable javascript and cookies to continue');
      const hasVerifyHumanPrompt = bodyText.includes('verify you are human');
      const hasCloudflareChallengeScript = !!document.querySelector(
        'script[src*="/cdn-cgi/challenge-platform/"]'
      );

      return (
        hasJustAMoment ||
        hasJsCookiesPrompt ||
        hasVerifyHumanPrompt ||
        hasCloudflareChallengeScript
      );
    });
  } catch {
    return false;
  }
}

async function shouldScrapeMarkdownContent(
  page: Puppeteer.Page,
  url: string,
  options?: ScrapeTabsOptions,
  httpStatus?: number
): Promise<{ allow: boolean; reason: string; excludeFromPersistence?: boolean }> {
  if (!options?.restrictContentToMediumLike) {
    return { allow: true, reason: 'content-restriction-disabled' };
  }

  if (typeof httpStatus === 'number' && httpStatus >= 400) {
    return {
      allow: false,
      reason: `http-status-${httpStatus}`,
      excludeFromPersistence: true,
    };
  }

  if (await isChallengeOrBlockedPage(page)) {
    return {
      allow: false,
      reason: 'challenge-or-blocked-page',
      excludeFromPersistence: true,
    };
  }

  if (await isMedium410LikePage(page)) {
    return {
      allow: false,
      reason: 'medium-410-like-page',
      excludeFromPersistence: true,
    };
  }

  const hostnameProbe = options.mediumHostnameSubstring || 'medium';
  if (isMediumHostname(url, hostnameProbe)) {
    return { allow: true, reason: `hostname-contains-${hostnameProbe.toLowerCase().trim()}` };
  }

  const [hasLogo, hasPlatformSignals] = await Promise.all([
    hasMediumHeaderLogo(page),
    hasMediumPlatformSignals(page),
  ]);

  if (hasLogo && hasPlatformSignals) {
    return { allow: true, reason: 'medium-logo-and-platform-signals' };
  }

  return {
    allow: false,
    reason: `non-medium-signals logo=${hasLogo} platform=${hasPlatformSignals}`,
  };
}





// ========================================================================================================
// ========================================================================================================
// Wrapper function to to scrape the basic (meta-) data of a single Article, from an Article's page
// It calls the scrapeMediumArticle() function
// It also uses the outer helper functions: extractFirstPathPart and formatDate
// ========================================================================================================
// ========================================================================================================

export async function scrapeArticleBasic(url: string): Promise<PostData> {
  // Connect to the configured scraping browser mode (headless by default)
  const session = await connectToBrowser();
  const { browser, owned, mode } = session;
  logScrapeTiming(`scrapeArticleBasic using browser mode=${mode}`);

  const page = await createScrapePage(browser);

  try {
    const navResponse = await page.goto(url, { waitUntil: 'networkidle2' });
    if (navResponse?.status() === 403) {
      await logHttp403Diagnostics(page, url, navResponse);
    }

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
    if (owned) {
      await browser.close();
    }
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
  urls: string[],
  options?: ScrapeTabsOptions
): Promise<PostData[]> {
  logFunctionHeader('collectPostsFromUrlTabs');

  const session = await connectToBrowser();
  const { browser, owned, mode } = session;
  logScrapeTiming(`collectPostsFromUrlTabs using browser mode=${mode}`);

  const useSharedRemoteDebugPage =
    mode === 'remote-debug' && timeConst.REMOTE_DEBUG_REUSE_SINGLE_PAGE;
  let sharedRemoteDebugPage: Puppeteer.Page | undefined;

  const concurrency = mode === 'remote-debug' ? 1 : timeConst.MARKDOWN_SCRAPE_CONCURRENCY;
  const limit = pLimit(concurrency);
  logScrapeTiming(`collectPostsFromUrlTabs using concurrency=${concurrency}`);

  try {
    if (useSharedRemoteDebugPage) {
      sharedRemoteDebugPage = await createScrapePage(browser);
      logScrapeTiming('collectPostsFromUrlTabs reusing single worker page in remote-debug mode');
    }

    let p = 0;
    const pagePromises = urls.map((url, index) =>
      limit(() =>
        _scrapeContextStorage.run({ article: `${index + 1}/${urls.length}` }, async () => {
          let page: Puppeteer.Page | undefined;
          let shouldClosePage = true;

          try {
            logScrapeLinkStart(
              'collectPostsFromUrlTabs',
              index + 1,
              url,
              urls.length
            );

          // Optional delay to avoid rapid tab creation
          // await new Promise((res) => setTimeout(res, 500));
          if (!useSharedRemoteDebugPage) {
            await new Promise((res) => setTimeout(res, timeConst.OPEN_NEW_TAB_DELAY));
          }

          if (useSharedRemoteDebugPage && sharedRemoteDebugPage) {
            page = sharedRemoteDebugPage;
            shouldClosePage = false;
          } else {
            page = await createScrapePage(browser);
          }

          console.log(`Opening: ${url}`);
          const navResponse = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeConst.TAB_INITIAL_PAGE_LOADING_DELAY, //15000,   /****** */
          });
          const navStatus = navResponse?.status();
          // 260405 Update: Added diagnostics for 403 responses on individual tabs
          if (navStatus === 403) {
            await logHttp403Diagnostics(page, url, navResponse);
          }

          const currentPage = page;

          // Scrape the article data by calling the scrapeMediumArticle() key-function
          const data = await scrapeMediumArticle(currentPage);

          const contentDecision = await measureScrapeStep(
            'shouldScrapeMarkdownContent',
            () => shouldScrapeMarkdownContent(currentPage, url, options, navStatus),
            `url=${url}`
          );

          logScrapeTiming(
            `${contentDecision.allow ? 'ALLOW' : 'SKIP'} scrapeMediumMarkdownContent | url=${url} | reason=${contentDecision.reason}`
          );

          if (contentDecision.allow) {
            const content = await measureScrapeStep(
              'scrapeMediumMarkdownContent',
              () => scrapeMediumMarkdownContent(currentPage),
              `url=${url}`
            );
            data.content = content;
          } else {
            data.content = '';
            if (contentDecision.excludeFromPersistence) {
              data.excludeFromPersistence = true;
              data.exclusionReason = contentDecision.reason;
              logScrapeTiming(
                `EXCLUDE post from persistence | url=${url} | reason=${contentDecision.reason}`
              );
            }
          }

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
          if (shouldClosePage && page && !page.isClosed()) {
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
      )
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
        console.log(` >= *** ==>> Post Raw Date: ${post.date} `);
        if (post.date && post.date.length) {
          post.date = formatDate(post.date);
        }
      }
    }
    console.log('>===> Total Number of fetched Posts: ', i);

    return retPosts; // results.filter((r): r is PostData => r !== null);
  } finally {
    if (
      useSharedRemoteDebugPage &&
      sharedRemoteDebugPage &&
      !timeConst.REMOTE_DEBUG_KEEP_WORKER_PAGE_OPEN &&
      !sharedRemoteDebugPage.isClosed()
    ) {
      try {
        await sharedRemoteDebugPage.close();
      } catch (closeErr) {
        if (closeErr instanceof Error) {
          console.warn('Error closing shared remote-debug worker page:', closeErr.message);
        } else {
          console.warn('Error closing shared remote-debug worker page:', closeErr);
        }
      }
    }

    if (owned) {
      await browser.close();
    }
  }
}

// ==========================================================================================
// Key Function to scrape the basic (meta-) data of an Article, from an Article's page
// ==========================================================================================
async function scrapeMediumArticle(page: Puppeteer.Page): Promise<PostData> {
  if (timeConst.SCRAPE_BROWSER_MODE === 'headless') {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    );
  }
  
  // await new Promise((resolve) => setTimeout(resolve, 1000));
  await new Promise((resolve) => setTimeout(resolve, timeConst.ADDITIONAL_PAGE_DELAY)); // 1000 ms delay for additional page loading

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
  const postData = await page.evaluate((SEL) => {
    const link = window.location.href;
    const hostname = new URL(link).hostname;
    const pubauthorslug = ''; //extractFirstPathPart(new URL(link).pathname);
    const pubEl = document.querySelector(SEL.publication);
    const pubname = pubEl && pubEl.textContent ? pubEl.textContent.trim() : '';
    const titleEl = document.querySelector(SEL.title);
    let title =
      titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
    // If empty, fallback to the page <title> tag
    if (!title) {
      title = document.title ? document.title.trim() : '';
    }
    const imgEl = document.querySelector(SEL.leadImage);
    const image = imgEl ? imgEl.getAttribute('src') || '' : '';
    const authorEl = document.querySelector(SEL.author);
    const authorname =
      authorEl && authorEl.textContent ? authorEl.textContent.trim() : '';




    // 250831 Update: Adding Author's Link
    let authorLink = '';
    if (authorEl) {
      const href = authorEl.getAttribute('href') || '';
      try {
        const u = new URL(href, location.href);
        u.search = ''; // remove ?query
        u.hash = '';   // remove #fragment (optional, in case you also want to drop these)
        authorLink = u.href;
      } catch {
        // fallback if href is malformed
        authorLink = href;
      }
    }
    // console.log('>= *** ==>> Extracted authorLink:', authorLink); // console.log does not work here due to the Puppeteer context







    // 250806 Update
    // 250905 Selectors Update : bh.m -> bi.m and ac.af -> ac.ag

    let rawDate = '';
    const outerContainer = document.querySelector(SEL.dateOuter);
    if (outerContainer) {
      const dateContainer = outerContainer.querySelector(SEL.dateInner);
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

    const likesBtn = document.querySelector(SEL.likesButton);
    let likes = 0;
    if (likesBtn) {
      const likesText = (likesBtn.textContent ?? '').trim();
      likes = parseInt(likesText.replace(/\D/g, ''), 10) || 0;
    }

    const commentsEl = document.querySelector(SEL.commentsCount);
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
      authorlink: authorLink,
      date: rawDate,
      likes,
      comments,
      content,
    };
  }, metaSEL);

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
  const pageUrl = page.url();

  // console.log('>= *** ==>> scrapeMediumMarkdownContent() - before getCleanedPageContent(), page: ', page);

  try {
    // Get cleaned HTML + captured supported iframe sources
    const { html: cleanedHtml, iframeEmbeds } = await measureScrapeStep(
      'getCleanedPageContent',
      () => getCleanedPageContent(page),
      `url=${pageUrl}`
    );

    const gistEmbeds = iframeEmbeds.filter((embed) => embed.type === 'gist');
    const stackademicEmbeds = iframeEmbeds.filter(
      (embed) => embed.type === 'stackademic'
    );
    const datawrapperEmbeds = iframeEmbeds.filter(
      (embed) => embed.type === 'datawrapper'
    );

    logScrapeTiming(
      `Cleaned HTML size=${cleanedHtml.length} chars, gist=${gistEmbeds.length}, stackademic=${stackademicEmbeds.length}, datawrapper=${datawrapperEmbeds.length} | url=${pageUrl}`
    );

    // console.log('>= *** ==>> scrapeMediumMarkdownContent() - after getCleanedPageContent() 🔍 Cleaned HTML: ', cleanedHtml);

    // Process gists using existing browser connection
    const htmlWithGists = await measureScrapeStep(
      'processGists',
      () => processGists(browser, cleanedHtml, gistEmbeds),
      `url=${pageUrl}`
    );

    const htmlWithStackademic = await measureScrapeStep(
      'processStackacademic',
      () => processStackacademic(browser, htmlWithGists, stackademicEmbeds),
      `url=${pageUrl}`
    );

    const htmlWithEmbeds = await measureScrapeStep(
      'processDatawrapper',
      () => processDatawrapper(browser, htmlWithStackademic, datawrapperEmbeds),
      `url=${pageUrl}`
    );




    
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
    return await measureScrapeStep(
      'turndown',
      () => turndownService.turndown(htmlWithEmbeds),
      `url=${pageUrl}`
    );
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

export async function getCleanedPageContent(
  page: import('puppeteer').Page
): Promise<{ html: string; iframeEmbeds: IframeEmbed[] }> {
  await autoScrollArticlePage(page);

  const pageUrl = page.url();

  try {
    await page.waitForSelector(cleanSEL.articleIframes, {
      timeout: timeConst.AFTER_AUTOSCROLL_GIST_IFRAME_SELECTOR_DELAY, // 1000 ms
    });
  } catch {
    // No supported iframe found within timeout
  }

  const iframeEmbeds: IframeEmbed[] = await measureScrapeStep(
    'collectSupportedIframeSources',
    () =>
      page.evaluate((SEL) => {
        const candidates = Array.from(
          document.querySelectorAll(`${SEL.articleIframes}, [data-src*="datawrapper.dwcdn.net"]`)
        );

        return candidates
          .map((el) => {
            const src =
              el.getAttribute('src') ||
              el.getAttribute('data-src') ||
              el.getAttribute('data-iframe-src') ||
              '';
            const title =
              el.getAttribute('title')?.trim() ||
              el.getAttribute('data-title')?.trim() ||
              '';

            return { src, title };
          })
          .filter((item) => Boolean(item.src));
      }, cleanSEL)
      .then((entries) =>
        entries
          .map((entry) => {
            const type = classifyIframeSource(entry.src);
            if (!type) return null;

            return {
              src: entry.src,
              title: entry.title,
              type,
            } as IframeEmbed;
          })
          .filter((item): item is IframeEmbed => item !== null)
      ),
    `url=${pageUrl}`
  );

  if (iframeEmbeds.length > 0) {
    logFunctionHeader('collectSupportedIframeSources');
    iframeEmbeds.forEach((embed, i) => {
      logScrapeLinkStart(
        `collectSupportedIframeSources:${embed.type}`,
        i + 1,
        embed.src,
        iframeEmbeds.length
      );
    });
  }

  console.log('Found supported iframe sources:', iframeEmbeds);

  const rawHTML = await measureScrapeStep(
    'extractCleanedArticleHtml',
    () =>
      page.evaluate((SEL, IFRAME_CONST) => {
        // --- helpers -------------------------------------------------------------

        const removeSpecificText = (
          root: HTMLElement,
          textsToRemove: string[]
        ) => {
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
            .querySelectorAll(SEL.speechifyIgnoreDivs)
            .forEach((el) => el.remove());
        };

        const fixHeadings = (root: HTMLElement) => {
          const h1s = root.querySelectorAll(SEL.headings);
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
          const firstHeading = root.querySelector(SEL.headings);
          if (firstHeading) {
            let prev = firstHeading.previousSibling;
            while (prev) {
              const toRemove = prev;
              prev = prev.previousSibling;
              toRemove?.parentNode?.removeChild(toRemove);
            }
          }
        };

        const injectDatawrapperPlaceholdersFromSerializedScripts = (
          root: HTMLElement
        ) => {
          const scripts = Array.from(root.querySelectorAll('script'));
          const seen = new Set<string>();

          for (const scriptEl of scripts) {
            const scriptText = scriptEl.textContent || '';
            if (!/datawrapper\.dwcdn\.net/i.test(scriptText)) {
              continue;
            }

            const matches = scriptText.match(
              /https:\\u002F\\u002Fdatawrapper\.dwcdn\.net\\u002F[A-Za-z0-9_-]+\\u002F\d+\\u002F/gi
            );

            if (!matches || matches.length === 0) {
              continue;
            }

            for (const encodedUrl of matches) {
              const decodedUrl = encodedUrl
                .replace(/\\u002F/g, '/')
                .replace(/^https:\/\//i, 'https://')
                .trim();

              if (!decodedUrl || seen.has(decodedUrl)) {
                continue;
              }

              seen.add(decodedUrl);

              const placeholder = document.createElement('div');
              placeholder.className = 'iframe-embed-placeholder';
              placeholder.setAttribute('data-embed-type', 'datawrapper');
              placeholder.setAttribute('data-iframe-src', decodedUrl);
              scriptEl.parentNode?.insertBefore(placeholder, scriptEl);
            }
          }
        };

        // Transform YouTube iframes into links and preserve known provider iframes as placeholders.
        const transformYouTubeIframes = (root: HTMLElement) => {
          const extractEmbedSrc = (el: Element): string => {
            return (
              el.getAttribute('src') ||
              el.getAttribute('data-src') ||
              el.getAttribute('data-iframe-src') ||
              ''
            );
          };

          const classifyIframeInDom = (src: string): IframeEmbedType | null => {
            if (!src) return null;

            try {
              const u = new URL(src, location.href);
              const hostname = u.hostname.toLowerCase();
              const pathname = u.pathname || '';
              const schema = (u.searchParams.get('schema') || '').toLowerCase();
              const urlParam = u.searchParams.get('url') || '';

              if (
                hostname === IFRAME_CONST.GIST_HOST ||
                pathname.endsWith('.js')
              ) {
                return 'gist';
              }

              if (
                hostname === IFRAME_CONST.STACKACADEMIC_HOST &&
                pathname.startsWith(IFRAME_CONST.STACKACADEMIC_MEDIA_PATH_PREFIX)
              ) {
                return 'stackademic';
              }

              if (hostname === IFRAME_CONST.DATAWRAPPER_HOST) {
                return 'datawrapper';
              }

              if ((schema === 'datawrapper' || schema === 'dwcdn') && urlParam) {
                const nested = new URL(urlParam, location.href);
                if (
                  nested.hostname.toLowerCase() === IFRAME_CONST.DATAWRAPPER_HOST
                ) {
                  return 'datawrapper';
                }
              }
            } catch {
              return null;
            }

            return null;
          };

          const iframes = Array.from(root.querySelectorAll(SEL.iframes));

          for (const iframe of iframes) {
            const src = extractEmbedSrc(iframe);
            let youtubeUrl: string | null = null;

            try {
              const u = new URL(src, location.href);
              const schema = u.searchParams.get('schema');
              const urlParam = u.searchParams.get('url');

              if (schema === 'youtube' && urlParam) {
                youtubeUrl = decodeURIComponent(urlParam);
              } else if (/youtube\.com\/embed\//i.test(src)) {
                const id = src.match(/embed\/([^?&]+)/)?.[1];
                if (id) youtubeUrl = `https://www.youtube.com/watch?v=${id}`;
              }
            } catch {
              // ignore parse errors and treat as non-YouTube
            }

            if (youtubeUrl) {
              const title = iframe.getAttribute('title')?.trim() || 'YouTube video';

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
              const embedType = classifyIframeInDom(src);

              if (embedType) {
                const placeholder = document.createElement('div');
                placeholder.className = 'iframe-embed-placeholder';
                placeholder.setAttribute('data-embed-type', embedType);
                placeholder.setAttribute('data-iframe-src', src);
                const title = iframe.getAttribute('title')?.trim();
                if (title) {
                  placeholder.setAttribute('data-iframe-title', title);
                }
                iframe.replaceWith(placeholder);
              } else {
                iframe.remove();
              }
            }
          }

          // Some Datawrapper embeds are lazy-loaded with data-src on non-iframe wrappers.
          const datawrapperNodes = Array.from(
            root.querySelectorAll('[data-src*="datawrapper.dwcdn.net"]')
          );

          for (const node of datawrapperNodes) {
            if (node.classList.contains('iframe-embed-placeholder')) continue;

            const src = extractEmbedSrc(node);
            const embedType = classifyIframeInDom(src);
            if (embedType !== 'datawrapper') continue;

            const placeholder = document.createElement('div');
            placeholder.className = 'iframe-embed-placeholder';
            placeholder.setAttribute('data-embed-type', 'datawrapper');
            placeholder.setAttribute('data-iframe-src', src);
            const title = node.getAttribute('title')?.trim();
            if (title) {
              placeholder.setAttribute('data-iframe-title', title);
            }
            node.replaceWith(placeholder);
          }
        };

        // --- scope target --------------------------------------------------------

        const titleEl = document.querySelector(SEL.title);
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

        // Extract Datawrapper embed URLs from serialized Medium state scripts
        // before script tags are removed by cleanTags.
        injectDatawrapperPlaceholdersFromSerializedScripts(container);

        container.querySelectorAll(SEL.cleanTags).forEach((el) => el.remove());

        removeSpecificText(container, [
          'Zoom image will be displayed',
          'Press enter or click to view image in full size',
        ]);

        removeContentBeforeFirstHeading(container);
        removeSpeechifyIgnoreDivs(container);
        fixHeadings(container);
        transformYouTubeIframes(container);

        return container.innerHTML;
      }, cleanSEL, iframeConst),
    `url=${pageUrl}`
  );

  logScrapeTiming(`Extracted cleaned HTML length=${rawHTML.length} | url=${pageUrl}`);

  return { html: rawHTML, iframeEmbeds };
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
  gistEmbeds: IframeEmbed[]
): Promise<string> {
  logFunctionHeader('processGists');
  console.log('Processing gists...');
  console.log('Captured gist iframe sources:', gistEmbeds);

  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Process .gist-meta blocks
  const gistBlocks = document.querySelectorAll('.gist-meta');
  if (gistBlocks.length > 0) {
    console.log(`Found ${gistBlocks.length} gist-meta blocks`);
    let gistIndex = 0;
    for (const gistMeta of gistBlocks) {
      gistIndex += 1;
      const rawCodeUrl =
        gistMeta
          .querySelector(iframeSEL.gistMetaRawLink)
          ?.getAttribute('href') || '';
      const gistPermalink =
        gistMeta
          .querySelector(iframeSEL.gistMetaPermalink)
          ?.getAttribute('href') || '';

      if (rawCodeUrl) {
        logIterationHeader(
          'processGists:gist-meta',
          gistIndex,
          gistBlocks.length,
          rawCodeUrl || gistPermalink || 'no-link'
        );

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
          console.warn('Failed to fetch gist code:', rawCodeUrl, err);
        }
      }
    }
  }

  // Process iframe-based gists using placeholders created in getCleanedPageContent().
  if (gistEmbeds.length > 0) {
    console.log(`Processing ${gistEmbeds.length} iframe-based gist embeds...`);

    for (let i = 0; i < gistEmbeds.length; i++) {
      const iframeUrl = gistEmbeds[i].src;
      if (!iframeUrl) continue;

      logScrapeLinkStart('processGists:iframe', i + 1, iframeUrl, gistEmbeds.length);

      try {
        const gistData = await extractCodeFromIframe(browser, iframeUrl);
        if (!gistData?.code) {
          console.warn(`Could not extract code from ${iframeUrl}`);
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

        const placeholder = Array.from(
          document.querySelectorAll('.iframe-embed-placeholder[data-embed-type="gist"]')
        ).find((el) => el.getAttribute('data-iframe-src') === iframeUrl);
        if (placeholder) {
          if (linkPara) {
            placeholder.replaceWith(pre, linkPara);
          } else {
            placeholder.replaceWith(pre);
          }
        } else {
          console.warn(`No gist placeholder found for iframe source: ${iframeUrl}`);
        }
      } catch (err) {
        console.warn(`Failed to process iframe gist: ${iframeUrl}`, err);
      }
    }
  }

  return document.body.innerHTML;
}

export async function processStackacademic(
  browser: Puppeteer.Browser,
  html: string,
  stackademicEmbeds: IframeEmbed[]
): Promise<string> {
  logFunctionHeader('processStackacademic');
  console.log('Processing Stackademic media embeds:', stackademicEmbeds.length);

  if (stackademicEmbeds.length === 0) {
    return html;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  for (let i = 0; i < stackademicEmbeds.length; i++) {
    const embed = stackademicEmbeds[i];
    logScrapeLinkStart(
      'processStackacademic:iframe',
      i + 1,
      embed.src,
      stackademicEmbeds.length
    );

    try {
      const extracted = await extractStackacademicContentFromIframe(
        browser,
        embed.src
      );

      const placeholder = Array.from(
        document.querySelectorAll('.iframe-embed-placeholder[data-embed-type="stackademic"]')
      ).find((el) => el.getAttribute('data-iframe-src') === embed.src);

      if (!placeholder) {
        console.warn(`No Stackademic placeholder found for iframe source: ${embed.src}`);
        continue;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'stackademic-media-content';

      if (embed.title) {
        const h3 = document.createElement('h3');
        h3.textContent = embed.title;
        wrapper.appendChild(h3);
      }

      if (extracted.rawMarkdown) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = extracted.rawMarkdown;
        pre.appendChild(code);
        wrapper.appendChild(pre);
      } else if (extracted.html) {
        const bodyContainer = document.createElement('div');
        bodyContainer.innerHTML = extracted.html;
        wrapper.appendChild(bodyContainer);
      } else if (extracted.text) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = extracted.text;
        pre.appendChild(code);
        wrapper.appendChild(pre);
      }

      const sourceLink = document.createElement('p');
      sourceLink.textContent = `[ Stackademic Media Source: ${embed.src} ]`;
      wrapper.appendChild(sourceLink);

      placeholder.replaceWith(wrapper);
    } catch (err) {
      console.warn(`Failed to process Stackademic iframe: ${embed.src}`, err);
    }
  }

  return document.body.innerHTML;
}

export async function processDatawrapper(
  browser: Puppeteer.Browser,
  html: string,
  datawrapperEmbeds: IframeEmbed[]
): Promise<string> {
  logFunctionHeader('processDatawrapper');

  console.log('Processing Datawrapper embeds from placeholders and collected sources...');

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const placeholderEmbeds: IframeEmbed[] = Array.from(
    document.querySelectorAll('.iframe-embed-placeholder[data-embed-type="datawrapper"]')
  )
    .map((el) => ({
      src: el.getAttribute('data-iframe-src') || '',
      title: el.getAttribute('data-iframe-title') || '',
      type: 'datawrapper' as const,
    }))
    .filter((embed) => Boolean(embed.src));

  const dataSrcEmbeds: IframeEmbed[] = Array.from(
    document.querySelectorAll('[data-src*="datawrapper.dwcdn.net"]')
  )
    .map((el) => ({
      src: el.getAttribute('data-src') || '',
      title: el.getAttribute('title') || '',
      type: 'datawrapper' as const,
    }))
    .filter((embed) => Boolean(embed.src));

  const linkEmbeds: IframeEmbed[] = Array.from(
    document.querySelectorAll('a[href*="datawrapper.dwcdn.net"]')
  )
    .map((el) => ({
      src: el.getAttribute('href') || '',
      title: (el.textContent || '').trim(),
      type: 'datawrapper' as const,
    }))
    .filter((embed) => Boolean(embed.src));

  const allEmbeds = [
    ...datawrapperEmbeds,
    ...placeholderEmbeds,
    ...dataSrcEmbeds,
    ...linkEmbeds,
  ]
    .map((embed) => ({
      ...embed,
      src: resolveDatawrapperUrl(embed.src),
    }))
    .filter(
    (embed, index, arr) =>
      arr.findIndex((candidate) => candidate.src === embed.src) === index
  );

  console.log(`Datawrapper embeds to process: ${allEmbeds.length}`);

  if (allEmbeds.length === 0) {
    return html;
  }

  for (let i = 0; i < allEmbeds.length; i++) {
    const embed = allEmbeds[i];
    logScrapeLinkStart(
      'processDatawrapper:iframe',
      i + 1,
      embed.src,
      allEmbeds.length
    );

    try {
      const sourceUrl = resolveDatawrapperUrl(embed.src);

      let info: { title: string; description: string; dataPreview: string } = {
        title: '',
        description: '',
        dataPreview: '',
      };
      try {
        info = await extractDatawrapperInfoFromIframe(browser, sourceUrl);
      } catch (err) {
        console.warn(`Failed extracting Datawrapper info, using fallback link only: ${sourceUrl}`, err);
      }
      const targetNode =
        Array.from(
          document.querySelectorAll('.iframe-embed-placeholder[data-embed-type="datawrapper"]')
        ).find((el) => resolveDatawrapperUrl(el.getAttribute('data-iframe-src') || '') === sourceUrl) ||
        Array.from(document.querySelectorAll('[data-src*="datawrapper.dwcdn.net"]')).find(
          (el) => resolveDatawrapperUrl(el.getAttribute('data-src') || '') === sourceUrl
        ) ||
        Array.from(document.querySelectorAll('a[href*="datawrapper.dwcdn.net"]')).find(
          (el) => resolveDatawrapperUrl(el.getAttribute('href') || '') === sourceUrl
        );

      const wrapper = document.createElement('div');
      wrapper.className = 'datawrapper-embed';

      const title = embed.title || info.title || 'Datawrapper chart';
      const pTitle = document.createElement('p');
      pTitle.textContent = `Datawrapper: ${title}`;
      wrapper.appendChild(pTitle);

      if (info.description) {
        const pDesc = document.createElement('p');
        pDesc.textContent = info.description;
        wrapper.appendChild(pDesc);
      }

      if (info.dataPreview) {
        const pData = document.createElement('p');
        pData.textContent = 'Data preview:';
        wrapper.appendChild(pData);

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = info.dataPreview;
        pre.appendChild(code);
        wrapper.appendChild(pre);
      }

      const pLink = document.createElement('p');
      pLink.textContent = `[ Open interactive chart: ${sourceUrl} ]`;
      wrapper.appendChild(pLink);

      if (targetNode) {
        targetNode.replaceWith(wrapper);
      } else {
        // Keep the embed content instead of dropping it when Medium markup has no stable anchor node.
        document.body.appendChild(wrapper);
      }
    } catch (err) {
      console.warn(`Failed to process Datawrapper iframe: ${embed.src}`, err);
    }
  }

  return document.body.innerHTML;
}

export async function extractStackacademicContentFromIframe(
  browser: Puppeteer.Browser,
  iframeUrl: string
): Promise<{ html: string; text: string; rawMarkdown: string }> {
  const page = await createScrapePage(browser);

  try {
    logScrapeTiming(`START extractStackacademicContentFromIframe | iframe=${iframeUrl}`);

    await page.goto(iframeUrl, {
      waitUntil: 'networkidle2',
      timeout: timeConst.STACKACADEMIC_MEDIA_PAGE_LOADING_DELAY,
    });

    const extracted = await page.evaluate((SEL) => {
      const root =
        document.querySelector(SEL.contentRootCandidates) || document.body;
      const cloned = root.cloneNode(true) as HTMLElement;

      cloned
        .querySelectorAll('script, style, noscript, iframe')
        .forEach((el) => el.remove());

      const html = cloned.innerHTML.trim();
      const text = (cloned.textContent || '').replace(/\s+\n/g, '\n').trim();

      let viewRawUrl = '';
      const allAnchors = Array.from(document.querySelectorAll('a'));
      for (const a of allAnchors) {
        const label = (a.textContent || '').trim().toLowerCase();
        if (label.includes('view raw')) {
          const href = a.getAttribute('href') || '';
          if (href) {
            try {
              viewRawUrl = new URL(href, location.href).toString();
            } catch {
              viewRawUrl = href;
            }
            break;
          }
        }
      }

      return { html, text, viewRawUrl };
    }, iframeSEL);

    const rawMarkdown = extracted.viewRawUrl
      ? await fetchStackacademicRawMarkdown(extracted.viewRawUrl)
      : '';

    return {
      html: extracted.html,
      text: extracted.text,
      rawMarkdown,
    };
  } catch (err) {
    console.warn(`Failed to extract Stackademic iframe content: ${iframeUrl}`, err);
    return { html: '', text: '', rawMarkdown: '' };
  } finally {
    logScrapeTiming(`END extractStackacademicContentFromIframe | iframe=${iframeUrl}`);
    await page.close();
  }
}

async function fetchStackacademicRawMarkdown(viewRawUrl: string): Promise<string> {
  try {
    const firstRes = await fetch(viewRawUrl);
    const firstText = await firstRes.text();
    const contentType = firstRes.headers.get('content-type') || '';

    const looksLikeHtml =
      /text\/html/i.test(contentType) ||
      /<html|<body|<head/i.test(firstText);

    if (!looksLikeHtml) {
      return firstText.trim();
    }

    const dom = new JSDOM(firstText);
    const rawLink = dom.window.document.querySelector<HTMLAnchorElement>(
      iframeSEL.gistMetaRawLink
    );

    if (!rawLink?.href) {
      return '';
    }

    const rawRes = await fetch(rawLink.href);
    const rawText = await rawRes.text();
    return rawText.trim();
  } catch (err) {
    console.warn(`Failed to fetch Stackademic raw markdown from ${viewRawUrl}`, err);
    return '';
  }
}

export async function extractDatawrapperInfoFromIframe(
  browser: Puppeteer.Browser,
  iframeUrl: string
): Promise<{ title: string; description: string; dataPreview: string }> {
  const page = await createScrapePage(browser);

  try {
    logScrapeTiming(`START extractDatawrapperInfoFromIframe | iframe=${iframeUrl}`);

    await page.goto(iframeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeConst.DATAWRAPPER_PAGE_LOADING_DELAY,
    });

    const meta = await page.evaluate((SEL) => {
      const titleMeta = document.querySelector(SEL.datawrapperTitleMeta);
      const descriptionMeta = document.querySelector(
        SEL.datawrapperDescriptionMeta
      );

      return {
        title:
          titleMeta?.getAttribute('content')?.trim() ||
          document.title?.trim() ||
          '',
        description:
          descriptionMeta?.getAttribute('content')?.trim() ||
          '',
      };
    }, iframeSEL);

    const dataPreview = await fetchDatawrapperDatasetPreview(iframeUrl);

    return {
      title: meta.title,
      description: meta.description,
      dataPreview,
    };
  } catch (err) {
    console.warn(`Failed to extract Datawrapper info from iframe: ${iframeUrl}`, err);
    return { title: '', description: '', dataPreview: '' };
  } finally {
    logScrapeTiming(`END extractDatawrapperInfoFromIframe | iframe=${iframeUrl}`);
    await page.close();
  }
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}

async function fetchDatawrapperDatasetPreview(iframeUrl: string): Promise<string> {
  try {
    const normalized = iframeUrl.endsWith('/') ? iframeUrl : `${iframeUrl}/`;
    const datasetUrl = `${normalized}dataset.csv`;
    const response = await fetch(datasetUrl);
    if (!response.ok) {
      return '';
    }

    const csvText = await response.text();
    if (!csvText.trim()) {
      return '';
    }

    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6)
      .map(stripHtmlTags);

    return lines.join('\n');
  } catch {
    return '';
  }
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
  const page = await createScrapePage(browser);

  try {
    logScrapeTiming(`START extractCodeFromIframe | iframe=${iframeUrl}`);

    // await page.goto(iframeUrl, { waitUntil: "networkidle0", timeout: 20000 });
    await page.goto(iframeUrl, {
      waitUntil: 'networkidle0',
      timeout: timeConst.GIST_PAGE_LOADING_DELAY,  //******/
    });

    // Find the raw code link
    const { rawCodeUrl, gistPermalink } = await page.evaluate((SEL) => {
      const rawLink = document.querySelector<HTMLAnchorElement>(
        SEL.gistMetaRawLink
      );
      const permalinkLink = document.querySelector<HTMLAnchorElement>(
        SEL.gistMetaPermalink
      );

      return {
        rawCodeUrl: rawLink?.href || null,
        gistPermalink: permalinkLink?.href || null,
      };
    }, iframeSEL);

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
    logScrapeTiming(`END extractCodeFromIframe | iframe=${iframeUrl}`);
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
  logFunctionHeader('scrapeList');
  logScrapeLinkStart('scrapeList', 1, url);

  console.log(
    'scrape-functions ->  scrapeList() started .... target URL: ',
    url
  );

  const listConnectTimeoutMs = Math.max(
    timeConst.TAB_INITIAL_PAGE_LOADING_DELAY,
    30000
  );

  // Connect to the configured scraping browser mode (headless by default)
  const session = await connectToBrowser();
  const { browser, owned, mode } = session;

  console.log(
    'scrape-functions ->  scrapeList() - Connected to Browser mode: ',
    mode
  );

  const page = await createScrapePage(browser);

  try {
    console.log(
      'scrape-functions ->  scrapeList() - trying to go to page: ',
      url
    );
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: listConnectTimeoutMs,
    });

    await page.waitForSelector(listSEL.allArticle, {
      timeout: Math.max(timeConst.INITIAL_PAGE_LOADING_DELAY, 10000),
    });

    const totalArticles = await autoScrollToEnd(
      page,
      timeConst.MAX_ARTICLES_NUMBER,
      timeConst.SCROLL_DELAY
    );

    const scrapedData = await scrapeMediumList(page);

    if (scrapedData.length > 0) {
      logFunctionHeader('scrapeList:articles');
      scrapedData.forEach((item, idx) => {
        logScrapeLinkStart('scrapeList:article', idx + 1, item.link, scrapedData.length);
        if (item.image) {
          logScrapeLinkStart('scrapeList:image', idx + 1, item.image, scrapedData.length);
        }
      });
    }

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
    if (owned) {
      await browser.close();
    }
  }
}

// ==========================================================================================
// Key Function to scrape a Medium List -
// It scrapes the basic meta-data of each Article from a Medium List
// ==========================================================================================
async function scrapeMediumList(page: Puppeteer.Page): Promise<PostData[]> {
  const pageUrl = page.url();

  logFunctionHeader('scrapeMediumList');
  logScrapeLinkStart('scrapeMediumList', 1, pageUrl);

  console.log(
    'scrape-functions ->  scrapeMediumList() started .... for page: ',
    pageUrl
  );

  return await page.evaluate((SEL) => {
    // Extract listname and timestamp
    const listnameEl = document.querySelector(SEL.headings);
    const rawlistname = listnameEl
      ? listnameEl.innerText.trim()
      : document.title.trim();
    const listname = rawlistname
      .replace(/^List:\s*/, '')
      .split('|')[0]
      .trim();
    const timestamp = new Date().toISOString();

    const posts = Array.from(document.querySelectorAll(SEL.allArticle));

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
      const infoEl = post.querySelector(SEL.postInfoBlock);
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
      const pubNameEl = post.querySelector(SEL.pubName);
      const authorNameEl = post.querySelector(SEL.authorName);
      const pubname = pubNameEl
        ? (pubNameEl as HTMLElement).innerText.trim()
        : '';
      const authorname = authorNameEl
        ? (authorNameEl as HTMLElement).innerText.trim()
        : '';


      // 250831 Update: Adding Author's Link
      let authorLink = '';
      if (authorNameEl) {
        const href = authorNameEl.closest('a')?.getAttribute('href') || '';
        try {
          const u = new URL(href, location.href);
          u.search = ''; // remove ?query
          u.hash = '';   // remove #fragment (optional, in case you also want to drop these)
          authorLink = u.href;
        } catch {
          // fallback if href is malformed
          authorLink = href;
        }
      }



      const postData: PostData = {
        counter: index + 1,
        hostname,
        listname,
        pubauthorslug,
        timestamp,
        pubname,
        authorname,
        authorlink: authorLink,
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
  }, listSEL);
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
  delay = timeConst.DEFAULT_AUTOSCROLL_DELAY //100
): Promise<void> {
  const pageUrl = page.url();

  await measureScrapeStep(
    'autoScrollArticlePage',
    async () => {
      const startedAt = Date.now();
      let stagnantSteps = 0;
      let prevScrollTop = -1;
      let prevScrollHeight = -1;
      let iterations = 0;

      while (Date.now() - startedAt < timeConst.AUTOSCROLL_MAX_DURATION_MS) {
        iterations += 1;

        const metrics = await page.evaluate(() => {
          const scrollTop =
            window.scrollY ||
            document.documentElement.scrollTop ||
            document.body.scrollTop ||
            0;
          const viewportHeight = window.innerHeight || 0;
          const scrollHeight =
            document.documentElement.scrollHeight ||
            document.body.scrollHeight ||
            0;
          return { scrollTop, viewportHeight, scrollHeight };
        });

        const nearBottom =
          metrics.scrollTop + metrics.viewportHeight >= metrics.scrollHeight - distance;
        const noProgress =
          metrics.scrollTop <= prevScrollTop && metrics.scrollHeight <= prevScrollHeight;

        if (nearBottom) {
          logScrapeTiming(
            `autoScrollArticlePage reached bottom after ${iterations} iterations | url=${pageUrl}`
          );
          break;
        }

        if (noProgress) {
          stagnantSteps += 1;
          if (stagnantSteps >= timeConst.AUTOSCROLL_MAX_STAGNANT_STEPS) {
            logScrapeTiming(
              `autoScrollArticlePage stopping after stagnant steps=${stagnantSteps} | url=${pageUrl}`
            );
            break;
          }
        } else {
          stagnantSteps = 0;
        }

        prevScrollTop = metrics.scrollTop;
        prevScrollHeight = metrics.scrollHeight;

        await page.evaluate((scrollDistance: number) => {
          window.scrollBy(0, scrollDistance);
        }, distance);

        await sleep(delay);
      }

      if (Date.now() - startedAt >= timeConst.AUTOSCROLL_MAX_DURATION_MS) {
        logScrapeTiming(`autoScrollArticlePage hit max duration | url=${pageUrl}`);
      }
    },
    `url=${pageUrl}`
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
