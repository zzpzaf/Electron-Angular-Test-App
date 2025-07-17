
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class Articlebasicscraper {
  
  constructor() {}

  /**
   * Calls the Electron main process to scrape the basic (meta) data of an article.
   * @param url The URL of the article to scrape.
   * @returns Promise with { success: boolean, data?: any, error?: string }
   */
  async scrapeArticle(url: string): Promise<{ success: boolean; data?: any; error?: string }> {
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
      const result = await window.electronAPI.invoke('scrape-article', url);
      return result;
    } catch (error: any) {
      console.error('Error during scrapeArticle invoke:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }


}
