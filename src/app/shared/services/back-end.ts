import { Injectable, signal } from '@angular/core';
import { Category, CategoryNode, DeleteCategoryResult, PostData } from '../../../../shared/projectObjects/varObjects';

interface DeleteFilesResult {
  deleted: string[];
  failed: string[];
}

@Injectable({
  providedIn: 'root',
})
export class BackEnd {

  
  public $articles = signal<PostData[]>([]);       // 250901 - Articles Signal
  public $categories = signal<Category[]>([]);   // 250901 - Categories Signal

  // public $selectedCategoryId = signal<number>(0);  // 250903 - Selected Category ID Signal
  public $selectedCategory = signal<Category | null>(null);  // 250906 - Selected Category Signal
  public $categoriesFilter = signal<'unassigned' | 'all' | 'byCategory'>('unassigned');  // 250906 - Categories Filter Signal




  // Generic invoke wrapper (helper function) to avoid repeating
  // the '... as Promise<string>' adition in return commands, everywhere
  //-------------------------------------------------------------------------
  private ipcInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    return window.electronAPI.invoke(channel, ...args) as Promise<T>;
  }


  /*
  * File System Handling functions
  * These functions are used to interact with the file system, such as copying files,
  * deleting files, and application main settings.
  * 
  */

  copyFile(source: string, destination: string): Promise<{ success: boolean }> {
    return this.ipcInvoke<{ success: boolean }>(
      'copy-file',
      source,
      destination
    );
  }

  copyMultiFiles(
    sourceFilePaths: string[],
    destinationFolder: string
  ): Promise<{ success: boolean }> {
    return this.ipcInvoke<{ success: boolean }>(
      'copy-wild-files',
      sourceFilePaths,
      destinationFolder
    );
  }

  deleteFiles(filePaths: string[]): Promise<DeleteFilesResult> {
    return this.ipcInvoke<DeleteFilesResult>('delete-files', filePaths);
  }

  closeDbConnections(): Promise<{ success: boolean; error?: string }> {
    return this.ipcInvoke<{ success: boolean; error?: string }>(
      'sqlite:close-db-connections'
    );
  }

  getPropertyValueBySubstring(key: string, substring: string): Promise<string> {
    return this.ipcInvoke<string>('get-property-by-substring', key, substring);
  }

  getPropertyValueByKey(key: string): Promise<string | null> {
    const result = this.ipcInvoke<string>('get-config-property-by-key', key);
    return result;
  }






  
  /*
  * Main Database Handling functions
  * These functions are used to interact with the main database,
  */

  insertArticles(posts: PostData[]): Promise<number> {
    return this.ipcInvoke<number>('sqlite:insert-articles-from-json-array', posts);
  }

  updateArticleContentById(id: number, newContent: string): Promise<boolean> {
    const result = this.ipcInvoke<boolean>('sqlite:update-article-content-by-id', id, newContent);
    return result;
  }

  updateArticleById(post: PostData): Promise<boolean> {
    const result = this.ipcInvoke<boolean>('sqlite:update-article-by-id', post);
    return result;
  }

  checkUrlExists(link: string): Promise<boolean> {
    return this.ipcInvoke<boolean>('sqlite:check-if-url-exists', link);
  }

  checkSlugExists(slug: string): Promise<boolean> {
    return this.ipcInvoke<boolean>('sqlite:check-if-slug-exists', slug);
  }

  getPostDataBySlug(slug: string): Promise<PostData | null> {
    return this.ipcInvoke<PostData | null>('sqlite:get-post-data-by-slug', slug);
  }

  getArticlesById(id? : number): Promise<PostData[]> {
     return this.ipcInvoke<PostData[]>('sqlite:get-articles-by-id', id);
  }



  // 250901 - Set Uncategorized Articles Signal
  async setUncategorizedArticlesSignal(): Promise<void> {
    this.$articles.set(await this.getUncategorizedArticles());
  }
  // 250901
  getUncategorizedArticles(): Promise<PostData[]> {
    const result = this.ipcInvoke<PostData[]>('sqlite:get-uncategorized-articles');
    return result;
  }

  // 250906 - Set Selected Category Signal
  async setSelectedCategorySignal(category_id: number): Promise<void> {
    this.$selectedCategory.set(await this.getCategoryById(category_id));
  }
  getCategoryById(id: number): Promise<Category | null> {
    return this.ipcInvoke<Category | null>('sqlite:get-category-by-id', id);
  }

  // 250907
  addNewCategory(name: string, parentId: number, description?: string): Promise<Category> {
    return this.ipcInvoke<Category>('sqlite:add-new-category', name, parentId, description);
  }

  // 250910 - Delete Category By Id
  async deleteCategoryById(id: number): Promise<DeleteCategoryResult> {
    const result = await this.ipcInvoke<DeleteCategoryResult>('sqlite:delete-category-by-id', id);
    return result;
  }

  // 250910
  async updateCategoryById(id: number, name: string, parentId: number | null, description?: string): Promise<boolean> {
    const result = await this.ipcInvoke<boolean>('sqlite:update-category-by-id', id, name, parentId, description);
    return result;
  }

  // 250903
  async setArticlesByCategoryIdSignal(category_id: number): Promise<void> {
    this.$articles.set(await this.getArticlesByCategoryId(category_id));
  }
  getArticlesByCategoryId(category_id: number): Promise<PostData[]> {
    return this.ipcInvoke<PostData[]>('sqlite:get-articles-by-category-id', category_id);
  }
  



  // 250904
  async setAllArticlesSignal(): Promise<void> {
    this.$articles.set(await this.getAllArticles());
  }
  getAllArticles(): Promise<PostData[]> {
    return this.ipcInvoke<PostData[]>('sqlite:get-all-articles');
  }

  


  // 250910
  async setAllCategoriesSignal(): Promise<void> {
    const categories: Category[] = await this.getCategoriesByParentId();
    this.$categories.set(categories);
  }
  async setRootCategoriesSignal(): Promise<void> {
     const categories: Category[] = await this.getCategoriesByParentId(null);
     this.$categories.set(categories);
  }
  async setSubCategoriesByParentIdSignal(parent_id: number): Promise<void> {
    const categories: Category[] = await this.getCategoriesByParentId(parent_id);
    this.$categories.set(categories);
  }

  getCategoriesByParentId(parent_id? : null | number): Promise<Category[]> {
     return this.ipcInvoke<Category[]>('sqlite:get-categories-by-parent-id', parent_id);
  }


  getCategoryForestByParentId(parent_id? : null | number): Promise<CategoryNode[]> {
     return this.ipcInvoke<CategoryNode[]>('sqlite:get-sub-category-forest-by-parent-id', parent_id);
  }


  // 250902
  // insertArticleCategories(articleCategoryData: { article_id: number; category_ids: number[] }): Promise<boolean> {
  //   const retval: Promise<boolean> = this.ipcInvoke<boolean>('sqlite:insert-Article-Categories', articleCategoryData);
  //   return retval;
  // }
  async insertArticleCategories(article_id: number, category_ids: number[]): Promise<boolean> {
    console.log('>===>> Backend - insertArticleCategories called with article_id:', article_id, 'category_ids:', category_ids);
    const retval: boolean = await this.ipcInvoke<boolean>('sqlite:insert-Article-Categories', article_id, category_ids);
    return retval;
  }


  // 250905
  async getCategoryIdsOfAnArticle(article_id: number): Promise<number[]> {
    const categoryIds = await this.ipcInvoke<number[]>('sqlite:get-category-ids-of-article', article_id);
    return categoryIds;
  }

  //250905
  async deleteAllArticleCategories(article_id: number): Promise<boolean> {
    const result = await this.ipcInvoke<boolean>('sqlite:delete-all-article-categories', article_id);
    return result;
  }

  // 250905
  async updateArticleCategoriesForSingleArticle(article_id: number, category_ids: number[]): Promise<boolean> {
    const result = await this.ipcInvoke<boolean>('sqlite:update-article-categories', article_id, category_ids);
    return result;
  }

  // 260327 - Update article categories for multiple articles
  async updateArticleCategoriesForMultipleArticles(article_ids: number[], category_ids: number[]): Promise<boolean> {
    const result = await this.ipcInvoke<boolean>('sqlite:update-article-categories-multiple', article_ids, category_ids);
    return result;
  }


  // 260328 - Delete multiple articles by their IDs
  async deleteArticlesByIds(article_ids: number[]): Promise<boolean> {
    const result = await this.ipcInvoke<boolean>('sqlite:delete-articles-by-ids', article_ids);
    return result;
  }


  /*
  * Application wide functions
  */
  quitApp() {
    return this.ipcInvoke('app:quit');
  }
}
