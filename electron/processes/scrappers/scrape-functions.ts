// scrape-functions.ts
// This file is part of an Electron application that scrapes basic article data from a given URL.
// 250715-16

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type * as Puppeteer from 'puppeteer';
import { PostData } from '../../../shared/projectObjects/varObjects';
import { formatDate } from '../../helpers/electron-utils';
import { extractFirstPathPart } from '../../../shared/utils/shared-utils';

import { BrowserWindow } from 'electron';

// Apply stealth plugin
puppeteer.use(StealthPlugin());

// ==========================================================================================
// Constants
// ==========================================================================================
const BROWSER_URLPORT = 'http://127.0.0.1:9222';
// Delay between clicks (in ms)
const DELAY_BETWEEN_CLICKS=1000
// Number of retry attempts for clicks
const RETRY_COUNT=3
// Auto-scroll delay between scrolls (in ms)
const SCROLL_DELAY=1500
// Max attempts to scroll with no new articles (stops if no new articles after N tries)
const MAX_ATTEMPTS_WITHOUT_NEW=5
// Maximum number of articles to load on the page (prevents infinite scroll)
const MAX_ARTICLES_NUMBER=250


// ==========================================================================================
// Key/main/root function to to scrape the basic (meta-) data of an Article, from an Article's page  
// ==========================================================================================
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
    postData.pubauthorslug = extractFirstPathPart(new URL(postData.link).pathname);

    return postData;
  } catch (error) {

    const window = BrowserWindow.getAllWindows()[0]; // get first (or target) window
    window.webContents.send('message-channel', error);

    throw error;
  } finally {
    await page.close();
    // Do NOT close the browser — we're just connected to it
  }
}


// ==========================================================================================
// Function to scrape the basic (meta-) data of an Article, from an Article's page  
// ==========================================================================================
async function scrapeMediumArticle(page: Puppeteer.Page): Promise<PostData> {
  await new Promise(resolve => setTimeout(resolve, 1000));

  const postData = await page.evaluate(() => {
    const link = window.location.href;
    const hostname = new URL(link).hostname;
    const pubauthorslug = '' ; //extractFirstPathPart(new URL(link).pathname);
    const pubEl = document.querySelector('h2 > div');
    const pubname = pubEl && pubEl.textContent ? pubEl.textContent.trim() : '';
    const titleEl = document.querySelector('h1[data-testid="storyTitle"]');
    const title = titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
    const imgEl = document.querySelector('figure img');
    const image = imgEl ? imgEl.getAttribute('src') || '' : '';
    const authorEl = document.querySelector('a[data-testid="authorName"]');
    const authorname = authorEl && authorEl.textContent ? authorEl.textContent.trim() : '';

    let rawDate = '';
    const outerContainer = document.querySelector('div.speechify-ignore.bh.m');
    if (outerContainer) {
      const dateContainer = outerContainer.querySelector('div.ac.af');
      if (dateContainer) {
        const childNodes = Array.from(dateContainer.childNodes);
        for (let i = childNodes.length - 1; i >= 0; i--) {
          const node = childNodes[i];
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ? node.textContent.trim() : '';
            if (text && text !== '·') {
              rawDate = text;
              break;
            }
          }
        }
      }
    }

    const likesBtn = document.querySelector('.pw-multi-vote-count button');
    let likes = 0;
    if (likesBtn) {
      const likesText = (likesBtn.textContent ?? '').trim();
      likes = parseInt(likesText.replace(/\D/g, ''), 10) || 0;
    }

    const commentsEl = document.querySelector('button[aria-label="responses"] .pw-responses-count');
    let comments = 0;
    if (commentsEl) {
      const commentsText = commentsEl.textContent ? commentsEl.textContent.trim() : '';
      comments = parseInt(commentsText.replace(/\D/g, ''), 10) || 0;
    }

    const timestamp = new Date().toISOString();
    const counter = 0;
    const listname = '';

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
    };
  });

  return postData;
}







// ==========================================================================================
// Key/main function: scrapeList to to scrape a Medium List 
// ==========================================================================================
export async function scrapeList(url: string): Promise<PostData[]> {
  // Connect to an already running Chrome instance with remote debugging enabled
  
  console.log("scrape-functions ->  scrapeList() started .... target URL: ", url);
  
  const browser = await puppeteer.connect({
    browserURL: BROWSER_URLPORT,
    defaultViewport: null,
  });

  const page = await browser.newPage();

  try {
    console.log("scrape-functions ->  scrapeList() - trying to go to page: ", url );
    await page.goto(url, { waitUntil: 'networkidle2' });

    const totalArticles = await autoScrollToEnd(page, MAX_ARTICLES_NUMBER, SCROLL_DELAY);

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
// Function to scrape a Medium List - 
// It scrapes the basic meta-data of each Article from a Medium List
// ==========================================================================================
async function scrapeMediumList(page: Puppeteer.Page): Promise<PostData[]> {

    console.log("scrape-functions ->  scrapeMediumList() started .... for page: ", page.url.toString);


    return await page.evaluate(() => {

    // Extract listname and timestamp
    const listnameEl = document.querySelector("h1");
    const rawlistname = listnameEl
      ? listnameEl.innerText.trim()
      : document.title.trim();
    const listname = rawlistname
      .replace(/^List:\s*/, "")
      .split("|")[0]
      .trim();
    const timestamp = new Date().toISOString();

    const posts = Array.from(document.querySelectorAll("article"));

    // *** Iterate through the displayed list posts ***
    const results: PostData[] = posts.map((post, index) => {
     // Extract title and link
      const titleEl = post.querySelector("h2");
      const titleLinkEl = titleEl ? titleEl.closest("a") : null;
      const title = titleEl ? titleEl.innerText.trim() : "No title";
      const link = titleLinkEl ? titleLinkEl.href.split("?")[0] : "No link";
      const hostname = new URL(link).hostname;
      const pubauthorslug = ''; //extractFirstPathPart(new URL(link).pathname);

      // Extract image
      const imgEls = post.querySelectorAll("img");
      let image = "No image";
      if (imgEls.length > 0) {
        const largestImg = Array.from(imgEls).reduce((max, img) => {
          const width = parseInt(img.getAttribute("width") || "0", 10);
          return width > parseInt(max.getAttribute("width") || "0", 10)
            ? img
            : max;
        });
        image = largestImg.src.replace(/\/resize:[^/]+\//, "/");
      }

      // Extract date (raw date), likes, comments, pubname, and authorname
      const infoEl = post.querySelector('span:has(svg[width="16"])');
      let rawDate = "",
        date = "",
        likes = 0,
        comments = 0;

      if (infoEl) {
        // const parts = infoEl.innerText.trim().split('\n').map(s => s.trim());
        const parts = (infoEl as HTMLElement).innerText
          .trim()
          .split("\n")
          .map((s: string) => s.trim());

        rawDate = parts[0] || "";
        likes = parts[1] ? parseInt(parts[1], 10) || 0 : 0;
        comments = parts[2] ? parseInt(parts[2], 10) || 0 : 0;
        // date = formatDate(rawDate);
        date = rawDate;
      }

      // Extract pubname and authorname
      const pubNameEl = post.querySelector('div a[href*="medium.com"] p');
      const authorNameEl = post.querySelector('div a[href^="/@"] p');
      const pubname = pubNameEl ? (pubNameEl as HTMLElement).innerText.trim() : "";
      const authorname = authorNameEl ? (authorNameEl as HTMLElement).innerText.trim() : "";

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






// ==========================================================================================
// Helper function to automatically scroll to the end of the page
// until a specified number of articles is reached or no new articles are loaded
// Returns the total number of articles found
// ==========================================================================================
export async function autoScrollToEnd(
  page: Puppeteer.Page,
  maxArticles: number,
  scrollDelay: number
): Promise<number> {
  let lastCount = await page.$$eval("article", (arts) => arts.length);
  let attemptsWithoutNew = 0;
  const maxAttempts = 5;
  let scrolls = 0;

  while (attemptsWithoutNew < maxAttempts) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(scrollDelay);

    const currentCount = await page.$$eval("article", (arts) => arts.length);
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


// ==========================================================================================
// Function to wait for user input
// It prompts the user to press ENTER to continue
// ==========================================================================================
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




// ==========================================================================================
// Helper function to click an element with retry logic
// It attempts to click the element a specified number of times
// If it fails, it waits and retries
// Returns true if the click was successful, false otherwise
// ==========================================================================================
export async function clickWithRetry(
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
