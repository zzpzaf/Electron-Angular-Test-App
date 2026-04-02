import { Injectable, inject } from '@angular/core';

import { PostData } from '../../../../shared/projectObjects/varObjects';
import { getMediumSlugFromUrl } from '../../../../shared/utils/shared-utils';
import { Articlebasicscraper } from './articlebasicscraper';
import { BackEnd } from './back-end';
import { DlgService } from './dlg-service';

export interface MultiScrapePrecheckSummary {
  totalUrls: number;
  uniqueUrls: string[];
  duplicateUrlCount: number;
  newCount: number;
  existingSlugCount: number;
}

export interface MultiScrapePersistSummary {
  totalScraped: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
}

export type MultiScrapePersistMode = 'dbSync' | 'insertOnlyNew';

@Injectable({
  providedIn: 'root',
})
export class Articlesmultiscraper {
  private articlebasicscraper = inject(Articlebasicscraper);
  private backendService = inject(BackEnd);
  private dlgService = inject(DlgService);

  async summarizeUrlsAgainstDb(urls: string[]): Promise<MultiScrapePrecheckSummary> {
    const normalizedUrls = (urls ?? []).map((url) => (url ?? '').trim()).filter((url) => url.length > 0);
    const uniqueUrls = Array.from(new Set(normalizedUrls));
    const existingArticles = await this.backendService.getAllArticles();
    const existingBySlug = this.buildExistingBySlug(existingArticles);

    let existingSlugCount = 0;
    for (const url of uniqueUrls) {
      const slug = getMediumSlugFromUrl(url);
      if (slug && existingBySlug.has(slug)) {
        existingSlugCount++;
      }
    }

    return {
      totalUrls: normalizedUrls.length,
      uniqueUrls,
      duplicateUrlCount: normalizedUrls.length - uniqueUrls.length,
      newCount: uniqueUrls.length - existingSlugCount,
      existingSlugCount,
    };
  }

  async persistScrapedArticlesWithDedup(
    dataArray: PostData[],
    selectedCategoryIds: number[] = [],
    mode: MultiScrapePersistMode = 'dbSync'
  ): Promise<MultiScrapePersistSummary> {
    if (!dataArray || dataArray.length === 0) {
      return { totalScraped: 0, insertedCount: 0, updatedCount: 0, skippedCount: 0 };
    }

    const eligibleDataArray = dataArray.filter((item) => !item.excludeFromPersistence);

    if (eligibleDataArray.length === 0) {
      return {
        totalScraped: dataArray.length,
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: dataArray.length,
      };
    }

    const existingArticles = await this.backendService.getAllArticles();
    const existingBySlug = this.buildExistingBySlug(existingArticles);
    const insertedArticles: PostData[] = [];
    const updatedArticles: PostData[] = [];
    let skippedCount = dataArray.length - eligibleDataArray.length;

    for (const scraped of eligibleDataArray) {
      const slug = getMediumSlugFromUrl(scraped.link);
      const existing = slug ? existingBySlug.get(slug) : undefined;

      if (!existing) {
        insertedArticles.push(scraped);
        continue;
      }

      if (mode === 'insertOnlyNew') {
        skippedCount++;
        continue;
      }

      if (this.areArticlesEquivalent(existing, scraped)) {
        skippedCount++;
        continue;
      }

      if (this.shouldUpdateExistingArticle(existing, scraped)) {
        updatedArticles.push({ ...scraped, id: existing.id });
        continue;
      }

      skippedCount++;
    }

    let insertedCount = 0;
    let updatedCount = 0;

    if (insertedArticles.length > 0) {
      insertedCount = await this.backendService.insertArticles(insertedArticles);
      if (insertedCount > 0) {
        await this.processMarkdownContentImages(insertedArticles);
        await this.applyCategoriesToArticles(insertedArticles, selectedCategoryIds);
      }
    }

    if (updatedArticles.length > 0) {
      for (const article of updatedArticles) {
        const ok = await this.backendService.updateArticleById(article);
        if (ok) {
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        await this.processMarkdownContentImages(updatedArticles);
        await this.applyCategoriesToArticles(updatedArticles, selectedCategoryIds);
      }
    }

    return {
      totalScraped: dataArray.length,
      insertedCount,
      updatedCount,
      skippedCount,
    };
  }

  /**
   * Inserts an array of full-scraped articles into DB, processes markdown images,
   * and updates article categories.
   */
  async insertScrapedArticlesArrayToDB(
    dataArray: PostData[],
    selectedCategoryIds: number[] = []
  ): Promise<number> {
    if (!dataArray || dataArray.length === 0) return 0;

    console.log(
      '>===>> Articlesmultiscraper - insertScrapedArticlesArrayToDB() Started ... Inserting scraped articles to DB:',
      dataArray.length
    );

    try {
      const summary = await this.persistScrapedArticlesWithDedup(
        dataArray,
        selectedCategoryIds,
        'dbSync'
      );

      if (summary.insertedCount > 0 || summary.updatedCount > 0) {
        this.dlgService
          .popup({
            token: 'succ',
            header: 'Articles Processed!',
            content:
              `Inserted: ${summary.insertedCount}\n` +
              `Updated: ${summary.updatedCount}\n` +
              `Skipped: ${summary.skippedCount}`,
            posAnsMsg: 'OK',
            negAnsMsg: '',
          })
          .subscribe((res) => console.log('Dialog closed with:', res));

        return summary.insertedCount;
      }

      console.error(
        'Articlesmultiscraper - No articles were inserted or updated.'
      );
      this.dlgService
        .popup({
          token: 'warn',
          header: 'No Article Changes',
          content: 'No articles were inserted or updated.',
          posAnsMsg: 'OK',
          negAnsMsg: '',
        })
        .subscribe((res) => console.log('Dialog closed with:', res));

      return 0;
    } catch (err) {
      console.error(
        'Articlesmultiscraper - Error inserting URLs to main DB:',
        err
      );
      return 0;
    }
  }

  /**
   * Processes images in markdown, rewrites links to DB links and updates content.
   */
  private async processMarkdownContentImages(articles: PostData[]): Promise<void> {
    console.log('>===>> Articlesmultiscraper - Starting processMarkdownContentImage() ...');

    for (const article of articles) {
      const urlSlug = getMediumSlugFromUrl(article.link);
      if (!urlSlug) continue;

      const articleData = await this.backendService.getPostDataBySlug(urlSlug);
      if (!(articleData && articleData.id && articleData.content)) continue;

      const imageProcessingResult =
        await this.articlebasicscraper.processImagesForArticleMarkdownContent(
          articleData.id,
          articleData.link,
          articleData.content
        );

      if (!imageProcessingResult) continue;

      for (const extracted of imageProcessingResult.extracted) {
        console.log('>===>> Articlesmultiscraper - Extracted image:', JSON.stringify(extracted));
      }
      for (const result of imageProcessingResult.results) {
        console.log(
          '>===>> Articlesmultiscraper - Image processing result:',
          JSON.stringify(result)
        );
      }

      const updatedContent = await this.articlebasicscraper.rewriteMarkdownWithDbLinks(
        articleData.content,
        imageProcessingResult.results
      );

      if (!updatedContent || updatedContent === articleData.content) continue;

      const updateResult = await this.backendService.updateArticleContentById(
        articleData.id,
        updatedContent
      );

      if (updateResult) {
        console.log(
          `>===>> Articlesmultiscraper - Article ID ${articleData.id} content updated with processed image links.`
        );
      } else {
        console.error(
          `Articlesmultiscraper - Failed to update content for Article ID ${articleData.id}.`
        );
      }
    }
  }

  private async applyCategoriesToArticles(
    articles: PostData[],
    selectedCategoryIds: number[]
  ): Promise<void> {
    if (selectedCategoryIds.length === 0) {
      return;
    }

    for (const article of articles) {
      const urlSlug = getMediumSlugFromUrl(article.link);
      if (!urlSlug) {
        continue;
      }

      const articleId = await this.backendService
        .getPostDataBySlug(urlSlug)
        .then((savedArticle) => savedArticle?.id);

      if (articleId == null) {
        continue;
      }

      this.backendService
        .updateArticleCategoriesForSingleArticle(articleId, selectedCategoryIds)
        .then((res) => {
          console.log(
            '>===>> Articlesmultiscraper - Article categories updated successfully?',
            res
          );
        });
    }
  }

  private buildExistingBySlug(existingArticles: PostData[]): Map<string, PostData> {
    const existingBySlug = new Map<string, PostData>();

    for (const article of existingArticles) {
      const slug = getMediumSlugFromUrl(article.link);
      if (!slug) {
        continue;
      }

      const current = existingBySlug.get(slug);
      if (!current || this.compareArticlesForPreference(article, current) > 0) {
        existingBySlug.set(slug, article);
      }
    }

    return existingBySlug;
  }

  private compareArticlesForPreference(candidate: PostData, current: PostData): number {
    const candidateDate = this.toComparableDate(candidate.date);
    const currentDate = this.toComparableDate(current.date);

    if (candidateDate !== currentDate) {
      return candidateDate - currentDate;
    }

    return (candidate.id ?? 0) - (current.id ?? 0);
  }

  private areArticlesEquivalent(existing: PostData, scraped: PostData): boolean {
    return (
      this.normalizeValue(existing.title) === this.normalizeValue(scraped.title) &&
      this.normalizeValue(existing.date) === this.normalizeValue(scraped.date) &&
      this.normalizeValue(existing.content) === this.normalizeValue(scraped.content) &&
      this.normalizeValue(getMediumSlugFromUrl(existing.link)) ===
        this.normalizeValue(getMediumSlugFromUrl(scraped.link))
    );
  }

  private shouldUpdateExistingArticle(existing: PostData, scraped: PostData): boolean {
    const existingDate = this.toComparableDate(existing.date);
    const scrapedDate = this.toComparableDate(scraped.date);

    if (existingDate === 0) {
      return true;
    }

    return scrapedDate > existingDate;
  }

  private toComparableDate(value: string | undefined): number {
    const normalized = this.normalizeValue(value);
    if (!normalized || normalized === 'unknown' || normalized === 'null') {
      return 0;
    }

    const digitsOnly = normalized.replace(/\D/g, '');
    if (digitsOnly.length >= 8) {
      const yyyy = Number(digitsOnly.slice(0, 4));
      const mm = Number(digitsOnly.slice(4, 6));
      const dd = Number(digitsOnly.slice(6, 8));
      if (Number.isFinite(yyyy) && Number.isFinite(mm) && Number.isFinite(dd)) {
        return yyyy * 10000 + mm * 100 + dd;
      }
    }

    const parsed = Date.parse(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private normalizeValue(value: string | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }
}
