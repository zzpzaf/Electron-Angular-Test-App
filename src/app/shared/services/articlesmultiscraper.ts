import { Injectable, inject } from '@angular/core';

import { PostData } from '../../../../shared/projectObjects/varObjects';
import { getMediumSlugFromUrl } from '../../../../shared/utils/shared-utils';
import { Articlebasicscraper } from './articlebasicscraper';
import { BackEnd } from './back-end';
import { DlgService } from './dlg-service';

@Injectable({
  providedIn: 'root',
})
export class Articlesmultiscraper {
  private articlebasicscraper = inject(Articlebasicscraper);
  private backendService = inject(BackEnd);
  private dlgService = inject(DlgService);

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
      // 1. Insert all full-scraped articles into articles table.
      const insertedCount = await this.backendService.insertArticles(dataArray);

      if (insertedCount > 0) {
        // 2. Insert/update article images from markdown content.
        await this.processMarkdownContentImages(dataArray);

        // 3. Set article categories.
        for (const article of dataArray) {
          const urlSlug = getMediumSlugFromUrl(article.link);
          if (!urlSlug) continue;

          const insertedArticleId = await this.backendService
            .getPostDataBySlug(urlSlug)
            .then((addedArticle) => addedArticle?.id);

          console.log(
            '>===>> Articlesmultiscraper - Setting categories for article ID:',
            insertedArticleId,
            ' - Categories:',
            selectedCategoryIds
          );

          if (
            selectedCategoryIds.length > 0 &&
            insertedArticleId !== undefined &&
            insertedArticleId !== null
          ) {
            this.backendService
              .updateArticleCategoriesForSingleArticle(insertedArticleId, selectedCategoryIds)
              .then((res) => {
                console.log(
                  '>===>> Articlesmultiscraper - Article categories updated successfully?',
                  res
                );
              });
          }
        }

        this.dlgService
          .popup({
            token: 'succ',
            header: 'Articles Inserted!',
            content: insertedCount + ' articles were inserted to the main DB.',
            posAnsMsg: 'OK',
            negAnsMsg: '',
          })
          .subscribe((res) => console.log('Dialog closed with:', res));

        return insertedCount;
      }

      console.error(
        'Articlesmultiscraper - Unexpected result from DB insert:',
        insertedCount
      );
      this.dlgService
        .popup({
          token: 'error',
          header: 'Error',
          content: 'Failed to insert article(s) to the main DB.',
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
}
