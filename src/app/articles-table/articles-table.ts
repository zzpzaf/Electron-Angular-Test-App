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
import { ArticleCategoriesSelection } from '../article-categories-selection/article-categories-selection';

@Component({
  selector: 'articles-table',
  imports: [
    FormsModule,
    NzTableModule,
    NzButtonModule,
    NzIconModule,
    NzRateModule,
    NzDrawerModule,
  ],
  templateUrl: './articles-table.html',
  styleUrl: './articles-table.scss'
})
export class ArticlesTable {

  // Articles signal
  public $articles = signal<PostData[]>([]);


  private readonly drawer = inject(NzDrawerService);

  
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
  async openCategoryDrawer(row: PostData): Promise<void> {
    // 1) Get the article id from the row (adjust the property if needed)

    const articleId: number = row.id!;

    // 2) Fetch initial category ids 
    // const initialKeys: number[]  = [41, 44, 97];
    const initialKeys: number[] = await this.backendService.getCategoryIdsOfAnArticle(articleId);
    console.log('>===>> Initial category keys for article id', articleId, ':', initialKeys);

    // 3) Create the drawer and pass the initial keys to the content component
    const drawerRef = this.drawer.create<
      ArticleCategoriesSelection,
      { initialKeys: number[] },
      number[] | undefined
    >({
      nzTitle: 'Select/Unselect article categories',
      nzWidth: 520,
      nzHeight: 200,
      nzClosable: true,
      nzMaskClosable: true,
      nzContent: ArticleCategoriesSelection,
      nzContentParams: { initialKeys }
    });

    // 4) On close, persist the final selection 
    drawerRef.afterClose.subscribe(async (selectedKeys) => {
      if (!selectedKeys) return; // user cancelled
      console.log('>===>> Selected category keys:', selectedKeys);
      // Persist the selected category ids for the article
      const result = await this.backendService.updateArticleCategories(articleId, selectedKeys);
      console.log('>===>> Update article categories result:', result);
    });
  }

}