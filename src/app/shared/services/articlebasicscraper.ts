// src/app/shared/services/articlebasicscraper.ts
// Article Basics Scraper Service

import { Injectable } from '@angular/core';
import { ScrapeResult } from '../../appObjects/angObjects';
import {
  PostData,
  ProcessMarkdownResult,
  RewriteResultItem,
  ScrapeTabsOptions,
} from '../../../../shared/projectObjects/varObjects';

const compName = 'Articlebasicscraper Service';

@Injectable({
  providedIn: 'root',
})
export class Articlebasicscraper {
  constructor() {}


  // Generic invoke wrapper (helper function) to avoid repeating
  // the '... as Promise<string>' adition in return commands, everywhere
  //-------------------------------------------------------------------------
  private ipcInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    return window.electronAPI.invoke(channel, ...args) as Promise<T>;
  }



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

  // ***
  async scrapeTabsList(
    urls: string[],
    options?: ScrapeTabsOptions
  ): Promise<{ success: boolean; data?: PostData[]; error?: string }> {
    if (!window?.electronAPI?.invoke) {
      console.error('Electron API is not available.');
      return { success: false, error: 'Electron API not available' };
    }
    try {
      console.log('Invoking scrape-tabs with ', urls.length, 'URLs');
      const result = (await window.electronAPI.invoke(
        'scrape-tabs',
        urls,
        options
      )) as ScrapeResult;
      return result;
    } catch (error: any) {
      console.error('Error during scrapeArticle invoke:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }






  // 250827
  // Process (gets and stores)images in markdown content for a given article
  processImagesForArticleMarkdownContent(
    articleId: number,
    articleUrl: string,
    markdown: string,
    opts?: { maxBytes?: number; setOrder?: boolean; startOrder?: number }
  ): Promise<ProcessMarkdownResult> {
    return this.ipcInvoke<ProcessMarkdownResult>(
      'images:process-markdown-for-article',
      articleId,
      articleUrl,
      markdown,
      opts
    ).then((data: ProcessMarkdownResult) => {
      // Log for debugging
      console.log('>===>> services/articlebasicscraper.ts -  processImagesForArticleMarkdownContent result:', data);

      // Return the typed result
      return data;
    });
  }




  
  // 250827
  // Rewrite image links in markdown with database links
  // async rewriteMarkdownWithDbLinks(
  // markdown: string,
  // results: RewriteResultItem[]
  // ): Promise<string> {
  //   const updatedContent:string = await this.ipcInvoke<string>(
  //     'images:rewrite-markdown-with-db-links',
  //     markdown,
  //     results
  //   );
  //   return updatedContent;
  // }
  rewriteMarkdownWithDbLinks(
  markdown: string,
  results: RewriteResultItem[]
  ): Promise<string> {
    return this.ipcInvoke<string>(
      'images:rewrite-markdown-with-db-links',
      markdown,
      results
    ).then((updatedContent: string) => {
      // Log for debugging
      // console.log('>===>> services/articlebasicscraper.ts -  rewriteMarkdownWithDbLinks Updated Content :', updatedContent);
      // Return the typed result
      return updatedContent;
    });
  }

}