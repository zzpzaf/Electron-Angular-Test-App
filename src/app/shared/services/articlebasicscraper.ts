import { Injectable } from '@angular/core';
import { ScrapeResult } from '../../appObjects/angObjects';

const compName = 'Articlebasicscraper Service';

@Injectable({
  providedIn: 'root',
})
export class Articlebasicscraper {
  constructor() {}

  /**
   * Calls the Electron main process to scrape the basic (meta) data of an article.
   * @param url The URL of the article to scrape.
   * @returns Promise with { success: boolean, data?: any, error?: string }
   */
  async scrapeArticle(
    url: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!window?.electronAPI?.invoke) {
      console.error('Electron API is not available.');
      return { success: false, error: 'Electron API not available' };
    }
    try {
      console.log('Invoking scrapeArticle with URL:', url);
      // Call (invoke) the Electron main process to scrape the article
      // The 'scrape-article' channel should be handled in the main process
      // and it should return a promise that resolves with the scraped data.
      // The result will be an object with success status and either data or error.
      const result = (await window.electronAPI.invoke(
        'scrape-article',
        url
      )) as ScrapeResult;
      return result;
    } catch (error: any) {
      console.error('Error during scrapeArticle invoke:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  // async *scrapeMultiArticles(
  //   urls: string[]
  // ): AsyncGenerator<
  //   { success: boolean; data?: any; error?: string },
  //   void,
  //   unknown
  // > {
  //   const BATCH_SIZE = 10;

  //   for (let i = 0; i < urls.length; i++) {
  //     const url = urls[i];
  //     //-- // 🕒 Start timer
  //     const start = Date.now();
  //     console.log('Invoking scrapeArticle with URL:', url);

  //     let response: { success: boolean; data?: any; error?: string };

  //     try {
  //       response = (await window.electronAPI.invoke('scrape-article', url)) as {
  //         success: boolean;
  //         data?: any;
  //         error?: string;
  //       };
  //       //-- // 🕒 Get and display the duration
  //       const duration = Date.now() - start;
  //       // console.log(`>===>> ✅ Scraped article (${i + 1}/${urls.length}): ${url} in ${duration} ms`);
  //       console.log(`>===>> ✅ Scraped article (${i + 1} in ${duration} ms`);
  //     } catch (err: any) {
  //       console.error('Error during scrapeArticle invoke:', err);
  //       response = { success: false, error: err.message || 'Unknown error' };
  //     }

  //     yield response; // Push result to caller

  //     // Optional: small pause between calls
  //     await new Promise((res) => setTimeout(res, 100));

  //     // Optionally send batch-complete signals every 10
  //     if ((i + 1) % BATCH_SIZE === 0) {
  //       console.log(`Completed batch of ${BATCH_SIZE} articles`);
  //     }
  //   }
  // }

  async scrapeList(
    url: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!window?.electronAPI?.invoke) {
      console.error('Electron API is not available.');
      return { success: false, error: 'Electron API not available' };
    }
    try {
      console.log('Invoking scrapeList with URL:', url);
      const result = (await window.electronAPI.invoke(
        'scrape-list',
        url
      )) as ScrapeResult;
      return result;
    } catch (error: any) {
      console.error('Error during scrapeArticle invoke:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  async scrapeTabsList(
    urls: string[]
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!window?.electronAPI?.invoke) {
      console.error('Electron API is not available.');
      return { success: false, error: 'Electron API not available' };
    }
    try {
      console.log('Invoking scrape-tabs with ', urls.length, 'URLs');
      const result = (await window.electronAPI.invoke(
        'scrape-tabs',
        urls
      )) as ScrapeResult;
      return result;
    } catch (error: any) {
      console.error('Error during scrapeArticle invoke:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }
}
