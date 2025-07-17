// scrape-article-basic.ts
// This file is part of an Electron application that scrapes basic article data from a given URL.
// 250715-16

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type * as Puppeteer from 'puppeteer';
import { PostData } from '../../../shared/projectObjects/varObjects';
import { formatDate } from '../../helpers/utils';

// Apply stealth plugin
puppeteer.use(StealthPlugin());

export async function scrapeArticleBasic(url: string): Promise<PostData> {
  // Connect to an already running Chrome instance with remote debugging enabled
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null,
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    const postData = await scrapeMediumArticle(page);
    postData.date = formatDate(postData.date);

    return postData;
  } catch (error) {
    throw error;
  } finally {
    await page.close();
    // Do NOT close the browser — we're just connected to it
  }
}

async function scrapeMediumArticle(page: Puppeteer.Page): Promise<PostData> {
  await new Promise(resolve => setTimeout(resolve, 1000));

  const postData = await page.evaluate(() => {
    const link = window.location.href;
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
    const category = '';

    return {
      counter,
      category,
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
