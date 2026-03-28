import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BackEnd } from '../shared/services/back-end';
import { PostData } from '../../../shared/projectObjects/varObjects';

import {
  NzTableModule,
  NzTableSortFn,
} from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzDrawerModule, NzDrawerService } from 'ng-zorro-antd/drawer';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox'; // 260327
import { ArticleCategoriesSelection } from '../article-categories-selection/article-categories-selection';


 type RowKey = number | string;


@Component({
  selector: 'articles-table',
  imports: [
    FormsModule,
    NzTableModule,
    NzButtonModule,
    NzIconModule,
    NzRateModule,
    NzDrawerModule,
    NzCheckboxModule, // 260327
  ],
  templateUrl: './articles-table.html',
  styleUrl: './articles-table.scss'
})
export class ArticlesTable {

  // Articles signal
  public $articles = signal<PostData[]>([]);
  public filter: 'unassigned' | 'all' | 'byCategory' = 'unassigned';
  public selectedCategory: string  = '';

  private readonly drawer = inject(NzDrawerService);


  // 260327 - isCategoriesCheckboxMode controls which UI appears in column 6.
  public isCategoriesCheckboxMode = signal(false);  
  // 260327 - selectedCategoryRows stores check/uncheck state and is perfect for future batch actions.
  private selectedCategoryRows = signal<Set<RowKey>>(new Set<RowKey>());  

  private backendService = inject(BackEnd);
  // Pagination state (two-way bound)
  pageIndex = 1;
  pageSize = 15;

  // Rating - tool-tips for rating stars
  public nzRateToolTips: string[] = ['bad', 'ok', 'good', 'great', 'must'];

  // Sort comparison functions
  private cmpStr = (v: any) => (v ?? '').toString().toLowerCase();
  // sortById: NzTableSortFn<PostData> = (a, b) => this.str(a.id).localeCompare(this.str(b.id));
  sortById: NzTableSortFn<PostData> = (a, b) => a.id! - b.id!;
  sortByTitle: NzTableSortFn<PostData> = (a, b) =>
    this.cmpStr(a.title).localeCompare(this.cmpStr(b.title));
  sortByLink: NzTableSortFn<PostData> = (a, b) =>
    this.cmpStr(a.link).localeCompare(this.cmpStr(b.link));
  sortByHostname: NzTableSortFn<PostData> = (a, b) =>
    this.cmpStr(a.hostname).localeCompare(this.cmpStr(b.hostname));
  sortByListname: NzTableSortFn<PostData> = (a, b) =>
    this.cmpStr(a.listname).localeCompare(this.cmpStr(b.listname));
  sortByDate: NzTableSortFn<PostData> = (a, b) => a.date.localeCompare(b.date);
  sortByLikes: NzTableSortFn<PostData> = (a, b) => a.likes - b.likes;
  sortByRanking: NzTableSortFn<PostData> = (a, b) =>
    (a.ranking ?? 0) - (b.ranking ?? 0);
  

  constructor() {
    // Obtain articles from backend service corresponding articles signal
    effect(() => {
      if (this.backendService.$articles()) {
        this.$articles.set(this.backendService.$articles());
      }
      this.filter = this.backendService.$categoriesFilter();
      // this.selectedCategory = this.backendService.$selectedCategoryId() > 0 ?
      if (this.backendService.$selectedCategory()) {
        this.selectedCategory = ': ' + this.backendService.$selectedCategory()!.name;
      }
      console.log('>===>> ArticlesTable - Articles signal updated, count=', this.$articles().length);
    });
  }

  ngOnInit() {
    // this.getUnassignedArticles();
  }

  // immutable update when user changes the stars
  onRankChange(row: PostData, value: number) {
    // this.posts.update((arr) =>
    //   arr.map((it) =>
    //     it.id === row.id || it.link === row.link
    //       ? { ...it, ranking: value }
    //       : it
    //   )
    // );
  }




  // Open a new Electron Window for showing Markdown content
  onMarkdown(row: PostData, index: number, e: MouseEvent) {
    e.stopPropagation(); // avoid triggering row click/expand
    // console.log('>===>> Markdown click', { row, index });
    const article: PostData = this.$articles().find(a => a.id === row.id)!;
    if (window.electronAPI.openWindow) {
      window.electronAPI.openWindow(article);
    }
  }

  // 250904
  // Create and open a category selection drawer and pass it the ArticleCategoriesSelection
  // component and initial keys
  async openCategoryDrawerForSingleArticle(row: PostData): Promise<void> {
    // 1) Get the article id from the row (adjust the property if needed)

    const articleId: number = row.id!;

    // 2) Fetch initial category ids 
    // const initialKeys: number[]  = [41, 44, 97];
    const initialKeys: number[] = await this.backendService.getCategoryIdsOfAnArticle(articleId);
    console.log('>===>> ArticlesTable - openCategoryDrawerForSingleArticle -Initial category keys for article id', articleId, ':', initialKeys);

    // 3) Create the drawer and pass the initial keys to the content component
    const drawerRef = this.drawer.create<
      ArticleCategoriesSelection,
      { initialKeys: number[], row: PostData },
      number[] | undefined
    >({
      nzTitle: 'Select/Unselect article categories',
      nzWidth: 520,
      nzHeight: 200,
      nzClosable: true,
      nzMaskClosable: true,
      nzContent: ArticleCategoriesSelection,
      nzContentParams: { initialKeys, row }
    });

    // 4) On close, persist the final selection 
    drawerRef.afterClose.subscribe(async (selectedKeys) => {
      if (!selectedKeys) return; // user cancelled
      console.log('>===>> Selected category keys:', selectedKeys);
      // Persist the selected category ids for the article
      const result = await this.backendService.updateArticleCategoriesForSingleArticle(articleId, selectedKeys);
      console.log('>===>> ArticlesTable - Update article categories result:', result);
      this.updateArticlesTable();
    });
  }

  // 250906
  updateArticlesTable() {
    console.log('>===>> ArticlesTable - updateArticlesTable: Filter: ', this.filter);
    switch (this.filter) {
      case 'all':
        this.backendService.setAllArticlesSignal();
        console.log('>===>> ArticlesTable - updateArticlesTable: ALL');
        break;
      case 'unassigned':
        this.backendService.setUncategorizedArticlesSignal();
        console.log('>===>> ArticlesTable - updateArticlesTable: UNCATEGORIZED');
        break;
      case 'byCategory':
         this.backendService.setArticlesByCategoryIdSignal(this.backendService.$selectedCategory()?.id ?? 0);
         console.log('>===>> ArticlesTable - updateArticlesTable: BYCATEGORY');
        break;
      default:
        this.$articles.set(this.backendService.$articles());
         console.log('>===>> ArticlesTable - updateArticlesTable: DEFAULT ???');
    }
  }



  // 260327 - Category checkbox mode methods

  // 260327 - Generate a unique key for each row based on id or link
  // It safely handles rows with missing id by falling back to link
  private rowKey(row: PostData): RowKey {
    return row.id ?? row.link;
  }

  // 260327 - Check if a row is currently selected (checked) based on its key
  public isRowChecked(row: PostData): boolean {
    return this.selectedCategoryRows().has(this.rowKey(row));
  }

  // 260327 - Toggle the category checkbox mode on/off
  public toggleCategoriesColumnMode(): void {
    this.isCategoriesCheckboxMode.update(v => !v);
  }

  // 260327 - Handle checkbox change for a row: add/remove its key from the selected set 
  public onCategoryRowCheckChange(row: PostData, checked: boolean): void {
    const key = this.rowKey(row);
    this.selectedCategoryRows.update(prev => {
    const next = new Set(prev);
    if (checked) {
    next.add(key);
    } else {
    next.delete(key);
    }
    return next;
    });
  }

  // 260327 - Example batch action that operates on selected rows  
  openCategoryDrawerForMultipleArticles(): void {
    const selectedArticleIds: number[] = this.$articles()
      .filter((row) => this.selectedCategoryRows().has(this.rowKey(row)))
      .map((row) => row.id)
      .filter((id): id is number => typeof id === 'number');

    console.log('>===>> ArticlesTable - selected article ids:', selectedArticleIds);


    // 1) Create the drawer and pass the initial keys to the content component
    const drawerRef = this.drawer.create<
      ArticleCategoriesSelection,
      { checkedArticleIds: number[], initialKeys: number[], row: PostData | null },
      number[] | undefined
    >({
      nzTitle: 'Select/Unselect categories for total: ' + selectedArticleIds.length + ' checked article(s)',
      nzWidth: 520,
      nzHeight: 200,
      nzClosable: true,
      nzMaskClosable: true,
      nzContent: ArticleCategoriesSelection,
      nzContentParams: { checkedArticleIds: selectedArticleIds, initialKeys: [], row: null }
    });

    // 2) On close, persist the final selection 
    drawerRef.afterClose.subscribe(async (selectedKeys) => {
      if (!selectedKeys) return; // user cancelled
      console.log('>===>> ArticlesTable - openCategoryDrawerForMultipleArticles - Selected category keys:', selectedKeys);
      // Persist the selected category ids for the checked articles 
      const result = await this.backendService.updateArticleCategoriesForMultipleArticles(selectedArticleIds, selectedKeys);
      console.log('>===>> ArticlesTable - Update multi-article categories result:', result);
      this.updateArticlesTable();
    });


  }


}