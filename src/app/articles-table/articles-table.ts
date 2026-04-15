import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BackEnd } from '../shared/services/back-end';
import { PostData } from '../../../shared/projectObjects/varObjects';

import {
  NzTableModule,
  NzTableSortFn,
} from 'ng-zorro-antd/table';
import { NzResizableModule, NzResizeEvent } from 'ng-zorro-antd/resizable';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzDrawerModule, NzDrawerService } from 'ng-zorro-antd/drawer';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox'; // 260327
import { NzInputModule } from 'ng-zorro-antd/input';
import { ArticleCategoriesSelection } from '../article-categories-selection/article-categories-selection';
import { DlgService } from '../shared/services/dlg-service'; // 260328
import { Articlebasicscraper } from '../shared/services/articlebasicscraper'; // 260330
import { LoaderService } from '../shared/services/loader-service'; // 260330
import { getMediumSlugFromUrl } from '../../../shared/utils/shared-utils'; // 260330
import { firstValueFrom } from 'rxjs';



type RowKey = number | string;
type MdFilterMode = 'all' | 'withMarkdown' | 'withoutMarkdown';
type SearchMode = 'words' | 'phrase';
type ArticleColumnKey =
  | 'id'
  | 'md'
  | 'delete'
  | 'title'
  | 'image'
  | 'date'
  | 'categories'
  | 'hostname'
  | 'publication'
  | 'author'
  | 'authorSlug'
  | 'listname'
  | 'likes'
  | 'comments'
  | 'ranking'
  | 'timestamp';

const ARTICLE_TABLE_COLUMN_WIDTHS_STORAGE_KEY = 'articles-table.column-widths';

const DEFAULT_ARTICLE_COLUMN_WIDTHS: Record<ArticleColumnKey, number> = {
  id: 64,
  md: 64,
  delete: 64,
  title: 420,
  image: 74,
  date: 112,
  categories: 128,
  hostname: 180,
  publication: 180,
  author: 180,
  authorSlug: 190,
  listname: 200,
  likes: 90,
  comments: 108,
  ranking: 140,
  timestamp: 182,
};


@Component({
  selector: 'articles-table',
  imports: [
    FormsModule,
    NzTableModule,
    NzResizableModule,
    NzButtonModule,
    NzIconModule,
    NzRateModule,
    NzDrawerModule,
    NzCheckboxModule, // 260327
    NzInputModule,
  ],
  templateUrl: './articles-table.html',
  styleUrl: './articles-table.scss'
})
export class ArticlesTable {

  // Articles signal
  public $articles = signal<PostData[]>([]);
  public $filteredArticles = computed(() => {
    const rows = this.$articles();
    const mdMode = this.mdFilterMode();
    const includeTerm = this.articlesSearchTextDebounced().trim().toLowerCase();
    const excludeTerm = this.articlesExcludeTextDebounced().trim().toLowerCase();
    const mdFilteredRows = rows.filter((row) => {
      const hasMd = this.hasMarkdownContent(row);
      if (mdMode === 'withMarkdown') return hasMd;
      if (mdMode === 'withoutMarkdown') return !hasMd;
      return true;
    });

    return mdFilteredRows.filter((row) => {
      const matchesInclude = !includeTerm || this.matchesSearch(row, includeTerm, this.includeSearchMode());
      const matchesExclude = !!excludeTerm && this.matchesSearch(row, excludeTerm, this.excludeSearchMode());

      return matchesInclude && !matchesExclude;
    });
  });
  public filter: 'unassigned' | 'all' | 'byCategory' = 'unassigned';
  public filter2: string = '';
  public selectedCategory: string  = '';
  public articlesSearchText = signal('');
  public articlesSearchTextDebounced = signal('');
  public articlesExcludeText = signal('');
  public articlesExcludeTextDebounced = signal('');
  public includeSearchMode = signal<SearchMode>('words');
  public excludeSearchMode = signal<SearchMode>('words');
  public $articleCategoryIdsByArticleId = signal<Record<number, number[]>>({});
  public mdFilterMode = signal<MdFilterMode>('all');
  public readonly minColumnWidth = 56;
  public readonly interColumnGapPx = 20;
  public readonly $columnWidths = signal<Record<ArticleColumnKey, number>>(DEFAULT_ARTICLE_COLUMN_WIDTHS);
  public readonly $tableScrollXPx = computed(() => {
    const widths = this.$columnWidths();
    const totalColumnWidth = Object.values(widths).reduce((sum, width) => sum + width, 0);
    const totalGapWidth = this.interColumnGapPx * (Object.keys(widths).length - 1);
    return `${totalColumnWidth + totalGapWidth}px`;
  });

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private categoryStatusLoadingIds = new Set<number>();

  private readonly drawer = inject(NzDrawerService);
  private dlgService = inject(DlgService);
  private articlebasicscraper = inject(Articlebasicscraper); // 260330
  private loaderService = inject(LoaderService); // 260330

  // 260327 - isCategoriesCheckboxMode controls which UI appears in column 6.
  public isCategoriesCheckboxMode = signal(false);  
  // 260327 - selectedCategoryRows stores check/uncheck state and is perfect for future batch actions.
  private selectedCategoryRows = signal<Set<RowKey>>(new Set<RowKey>());  

  // 260328 - Delete column UI mode and selected rows for future multi-delete action.
  public isDeleteCheckboxMode = signal(false);
  private selectedDeleteRows = signal<Set<RowKey>>(new Set<RowKey>());

  // 260331 - Focus highlight for double-clicked row (independent of other selections).
  private focusHighlightedRowKey = signal<RowKey | null>(null);

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
  sortByTimestamp: NzTableSortFn<PostData> = (a, b) => a.timestamp.localeCompare(b.timestamp);


  constructor() {
    this.restoreColumnWidths();

    // Obtain articles from backend service corresponding articles signal
    effect(() => {
      if (this.backendService.$articles()) {
        this.$articles.set(this.backendService.$articles());
      }
      this.filter = this.backendService.$categoriesFilter();
      const activeCategory = this.backendService.$selectedCategory();
      this.selectedCategory = this.filter === 'byCategory' && activeCategory
        ? activeCategory.name
        : '';

      // Prefetch category status for currently visible rows (used by categories tag icon styling).
      this.prefetchCategoryStatusForVisibleRows(this.$filteredArticles());
      console.log('>===>> ArticlesTable - Articles signal updated, count=', this.$articles().length);
    });
  }

  public getFilterSummaryLabel(): string {
    switch (this.filter) {
      case 'all':
        return 'All articles';
      case 'byCategory':
        return this.selectedCategory
          ? `Category: ${this.selectedCategory}`
          : 'Category';
      case 'unassigned':
      default:
        return 'Unassigned articles';
    }
  }

  ngOnInit() {
    // this.getUnassignedArticles();
  }

  ngOnDestroy() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
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
      console.log('>===>> ArticlesTable - openCategoryDrawerForSingleArticle 4 - Selected category keys:', selectedKeys);
      // Persist the selected category ids for the article
      const result = await this.backendService.updateArticleCategoriesForSingleArticle(articleId, selectedKeys);
      console.log('>===>> ArticlesTable - openCategoryDrawerForSingleArticle 4 - Update article categories result:', result);
      if (result) {
        this.setArticleCategoryIdsCache(articleId, selectedKeys);
      }
      // 260328 - clear the selected checkbox -if it has been checked- after the action is done:
      if (this.selectedCategoryRows().has(this.rowKey(row))) {
        console.log('>===>> ArticlesTable - openCategoryDrawerForSingleArticle 4 - Clearing selected checkbox for article id:', articleId);
        this.selectedCategoryRows.update(prev => {
          const next = new Set(prev);
          next.delete(this.rowKey(row));
          return next;
        });
      }
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

  // 260328 - Search UI handlers (UI phase only)
  onSearchTextChange(value: string): void {
    this.articlesSearchText.set(value ?? '');
    this.scheduleSearchDebounce();
  }

  public onExcludeSearchTextChange(value: string): void {
    this.articlesExcludeText.set(value ?? '');
    this.scheduleSearchDebounce();
  }

  private scheduleSearchDebounce(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.applySearchDebouncedValues();
      this.searchDebounceTimer = null;
    }, 150);
  }

  // 260328 - Clear include search text and reset related signals and UI state
  clearArticlesSearchText(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.articlesSearchText.set('');
    this.applySearchDebouncedValues();
  }

  public clearArticlesExcludeText(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.articlesExcludeText.set('');
    this.applySearchDebouncedValues();
  }

  private applySearchDebouncedValues(): void {
    const includeDebounced = this.articlesSearchText().trim();
    const excludeDebounced = this.articlesExcludeText().trim();
    this.articlesSearchTextDebounced.set(includeDebounced);
    this.articlesExcludeTextDebounced.set(excludeDebounced);
    this.filter2 = includeDebounced;
  }

  public toggleIncludeSearchMode(): void {
    this.includeSearchMode.update((current) => (current === 'words' ? 'phrase' : 'words'));
  }

  public toggleExcludeSearchMode(): void {
    this.excludeSearchMode.update((current) => (current === 'words' ? 'phrase' : 'words'));
  }

  public getIncludeSearchModeLabel(): string {
    return this.includeSearchMode() === 'words' ? 'Search words' : 'Search phrases';
  }

  public getExcludeSearchModeLabel(): string {
    return this.excludeSearchMode() === 'words' ? 'Exclude words' : 'Exclude phrases';
  }

  public getIncludeSearchModeTitle(): string {
    if (this.includeSearchMode() === 'words') {
      return 'Search mode: match any entered word. Click to switch to whole-phrase search.';
    }

    return 'Search mode: match the whole entered phrase. Click to switch to any-word search.';
  }

  public getExcludeSearchModeTitle(): string {
    if (this.excludeSearchMode() === 'words') {
      return 'Exclude mode: remove rows matching any entered word. Click to switch to whole-phrase exclude.';
    }

    return 'Exclude mode: remove rows matching the whole entered phrase. Click to switch to any-word exclude.';
  }

  // 260328 - Check if any of the relevant fields in the row match the search term (case-insensitive)
  // For now I just left only title, but we can easily add more fields 
  private matchesSearch(row: PostData, term: string, mode: SearchMode): boolean {
    const values: string[] = [
      row.title,
      // row.link,
      // row.hostname,
      // row.pubname,
      // row.authorname,
      // row.pubauthorslug,
      // row.listname,
      // row.date,
      String(row.likes ?? ''),
      String(row.comments ?? ''),
      row.timestamp,
    ].map((v) => (v ?? '').toString().toLowerCase());

    if (mode === 'phrase') {
      return values.some((v) => v.includes(term));
    }

    const words = this.getSearchWords(term);
    if (words.length === 0) {
      return true;
    }

    return values.some((value) => words.some((word) => value.includes(word)));
  }

  private getSearchWords(term: string): string[] {
    return term
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 0);
  }

  // 260328 - Highlight search term in the title by wrapping matches with <mark> tags, while safely escaping HTML
  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 260328 - Highlight search term in the title by wrapping matches with <mark> tags, while safely escaping HTML
  highlightTitle(title: string | null | undefined): string {
    const rawTitle = title ?? '';
    const safeTitle = this.escapeHtml(rawTitle);
    const term = this.articlesSearchTextDebounced().trim();

    if (!term) return safeTitle;

    const tokens = this.includeSearchMode() === 'phrase'
      ? [term]
      : this.getSearchWords(term);

    if (tokens.length === 0) {
      return safeTitle;
    }

    const regex = new RegExp(
      `(${tokens
        .map((token) => this.escapeRegExp(token))
        .sort((left, right) => right.length - left.length)
        .join('|')})`,
      'ig'
    );
    return safeTitle.replace(regex, '<mark class="search-hit">$1</mark>');
  }

  // 260330 - MD column header 3-state filter toggle: all -> with markdown -> without markdown.
  public toggleMdFilterMode(): void {
    const current = this.mdFilterMode();
    if (current === 'all') {
      this.mdFilterMode.set('withMarkdown');
      return;
    }
    if (current === 'withMarkdown') {
      this.mdFilterMode.set('withoutMarkdown');
      return;
    }
    this.mdFilterMode.set('all');
  }

  public getMdFilterLabel(): string {
    const mode = this.mdFilterMode();
    if (mode === 'withMarkdown') return 'Has';
    if (mode === 'withoutMarkdown') return 'Empty';
    return 'All';
  }

  public getMdFilterTitle(): string {
    const mode = this.mdFilterMode();
    if (mode === 'withMarkdown') {
      return 'MD filter: only articles containing markdown content. Click to switch to empty content only.';
    }
    if (mode === 'withoutMarkdown') {
      return 'MD filter: only articles with empty content. Click to switch to all articles.';
    }
    return 'MD filter: all articles. Click to switch to only articles containing markdown content.';
  }

  private hasMarkdownContent(row: PostData): boolean {
    return typeof row.content === 'string' && row.content.trim().length > 0;
  }

  public hasMarkdownForRow(row: PostData): boolean {
    return this.hasMarkdownContent(row);
  }

  // 260330 - True when the MD column filter is in "withoutMarkdown" (Empty) mode.
  public isEmptyMdMode(): boolean {
    return this.mdFilterMode() === 'withoutMarkdown';
  }

  // 260330 - Re-scrape an article that has empty content and persist the result.
  // This is a long-running operation that involves multiple steps and user feedback, 
  // so we use the loader service to show a loading indicator and block interactions during the process.
  // Steps: 
  // 1) Scrape fresh content from the article URL, 
  // ) Persist the updated article row, 
  // 3) Process and store images found in the new markdown content, 
  // 4) Refresh the table so the MD icon reflects the new content state.  
  public async rescrapeArticle(row: PostData, e: MouseEvent): Promise<void> {
    e.stopPropagation();

    const url = row.link;
    if (!url) {
      console.warn('>===>> rescrapeArticle: row has no link, skipping.');
      return;
    }

    console.log('>===>> rescrapeArticle: re-scraping article id', row.id, 'url:', url);

    await this.loaderService.withLoader(async () => {
      // 1. Scrape fresh content from the URL.
      const response = await this.articlebasicscraper.scrapeTabsList([url]);
      if (!response.success || !Array.isArray(response.data) || response.data.length === 0) {
        console.error('>===>> rescrapeArticle: scrape failed for url:', url, response.error);
        this.dlgService.popup({
          token: 'error',
          header: 'Re-scrape Failed',
          content: `Could not scrape content for article id ${row.id}.\n${response.error ?? ''}`,
          posAnsMsg: 'OK',
          negAnsMsg: '',
        }).subscribe();
        return;
      }

      const scraped: PostData = response.data[0];
      scraped.id = row.id; // preserve existing DB id

      // 2. Persist the updated article row.
      const updateOk = await this.backendService.updateArticleById(scraped);
      if (!updateOk) {
        console.error('>===>> rescrapeArticle: updateArticleById failed for id:', row.id);
        this.dlgService.popup({
          token: 'error',
          header: 'Save Failed',
          content: `Re-scraped content could not be saved for article id ${row.id}.`,
          posAnsMsg: 'OK',
          negAnsMsg: '',
        }).subscribe();
        return;
      }

      // 3. Process and store images found in the new markdown content.
      if (scraped.content && scraped.content.trim().length > 0) {
        const urlSlug = getMediumSlugFromUrl(url);
        const savedArticle = await this.backendService.getPostDataBySlug(urlSlug);
        if (savedArticle?.id && savedArticle.content) {
          const imgResult = await this.articlebasicscraper.processImagesForArticleMarkdownContent(
            savedArticle.id,
            savedArticle.link,
            savedArticle.content
          );
          if (imgResult) {
            const updatedContent = await this.articlebasicscraper.rewriteMarkdownWithDbLinks(
              savedArticle.content,
              imgResult.results
            );
            if (updatedContent && updatedContent !== savedArticle.content) {
              await this.backendService.updateArticleContentById(savedArticle.id, updatedContent);
            }
          }
        }
      }

      console.log('>===>> rescrapeArticle: completed for article id', row.id);
      this.dlgService.popup({
        token: 'succ',
        header: 'Re-scrape Complete',
        content: `Article id ${row.id} has been re-scraped and saved.`,
        posAnsMsg: 'OK',
        negAnsMsg: '',
      }).subscribe();

      // 4. Refresh the table so the MD icon reflects the new content state.
      this.updateArticlesTable();
    }, 'Re-scraping article …');
  }

  // 260331 - Check if a row is currently focus-highlighted (via double-click).
  public isFocusHighlighted(row: PostData): boolean {
    return this.focusHighlightedRowKey() === this.rowKey(row);
  }

  // 260331 - Handle double-click on a row to toggle focus highlight.
  // If the row is already highlighted, un-highlight it.
  // If a different row is highlighted, switch highlight to this row.
  public onRowDoubleClick(row: PostData, e: MouseEvent): void {
    e.stopPropagation();
    const key = this.rowKey(row);
    const current = this.focusHighlightedRowKey();

    if (current === key) {
      // Same row double-clicked → un-highlight
      this.focusHighlightedRowKey.set(null);
    } else {
      // Different row or no highlight → highlight this row
      this.focusHighlightedRowKey.set(key);
    }
  }

  // 260327 - Category checkbox mode methods

  public onColumnResizeEnd(event: NzResizeEvent, key: ArticleColumnKey): void {
    const nextWidth = Number(event.width);
    if (!Number.isFinite(nextWidth) || nextWidth <= 0) {
      return;
    }

    const clampedWidth = Math.max(this.columnMinWidthPx(key), Math.round(nextWidth));
    this.$columnWidths.update((prev) => ({
      ...prev,
      [key]: clampedWidth,
    }));
    this.persistColumnWidths();
  }

  public columnMinWidthPx(key: ArticleColumnKey): number {
    const strictHeaderMins: Partial<Record<ArticleColumnKey, number>> = {
      md: 78,
      delete: 76,
      categories: 128,
    };

    return strictHeaderMins[key] ?? this.minColumnWidth;
  }

  public columnWidthPx(key: ArticleColumnKey): string {
    return `${this.$columnWidths()[key]}px`;
  }

  private restoreColumnWidths(): void {
    const storage = this.getLocalStorage();
    if (!storage) {
      return;
    }

    try {
      const raw = storage.getItem(ARTICLE_TABLE_COLUMN_WIDTHS_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<Record<ArticleColumnKey, unknown>>;
      const merged = { ...DEFAULT_ARTICLE_COLUMN_WIDTHS };

      for (const key of Object.keys(DEFAULT_ARTICLE_COLUMN_WIDTHS) as ArticleColumnKey[]) {
        const value = Number(parsed[key]);
        if (!Number.isFinite(value) || value <= 0) {
          continue;
        }

        merged[key] = Math.max(this.columnMinWidthPx(key), Math.round(value));
      }

      this.$columnWidths.set(merged);
    } catch (error) {
      console.warn('>===>> ArticlesTable - restoreColumnWidths failed:', error);
    }
  }

  private persistColumnWidths(): void {
    const storage = this.getLocalStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(
        ARTICLE_TABLE_COLUMN_WIDTHS_STORAGE_KEY,
        JSON.stringify(this.$columnWidths())
      );
    } catch (error) {
      console.warn('>===>> ArticlesTable - persistColumnWidths failed:', error);
    }
  }

  private getLocalStorage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

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

  // 260330 - True when all currently filtered rows are selected in categories checkbox mode.
  public areAllFilteredRowsCategoryChecked(): boolean {
    const filteredRows = this.$filteredArticles();
    if (filteredRows.length === 0) {
      return false;
    }

    const selected = this.selectedCategoryRows();
    return filteredRows.every((row) => selected.has(this.rowKey(row)));
  }

  // 260330 - Toggle select/unselect all currently filtered rows for categories checkbox mode.
  public toggleAllFilteredCategoryRows(event: Event): void {
    event.stopPropagation();

    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }

    if (!this.isCategoriesCheckboxMode()) {
      return;
    }

    const filteredRows = this.$filteredArticles();
    if (filteredRows.length === 0) {
      return;
    }

    const keys = filteredRows.map((row) => this.rowKey(row));
    this.selectedCategoryRows.update((prev) => {
      const next = new Set(prev);
      const allSelected = keys.every((key) => next.has(key));

      if (allSelected) {
        for (const key of keys) {
          next.delete(key);
        }
      } else {
        for (const key of keys) {
          next.add(key);
        }
      }

      return next;
    });
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

  // 260328 - Delete column UI handlers (TODO: wire to real delete functionality later)
  public toggleDeleteColumnMode(): void {
    const next = !this.isDeleteCheckboxMode();
    this.isDeleteCheckboxMode.set(next);

    // Leaving checkbox mode resets staged delete selection.
    if (!next) {
      this.selectedDeleteRows.set(new Set<RowKey>());
    }
  }

  // 280328 - Check if a row is currently selected for deletion based on its key
  public isDeleteRowChecked(row: PostData): boolean {
    return this.selectedDeleteRows().has(this.rowKey(row));
  }

  // 280328 - Handle checkbox change for delete action: add/remove row key from selectedDeleteRows set
  public onDeleteRowCheckChange(row: PostData, checked: boolean): void {
    const key = this.rowKey(row);
    this.selectedDeleteRows.update((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  // 260328 - Handler for deleting a single article (to be implemented)
  public onDeleteSingleArticle(row: PostData, e: MouseEvent): void {
    e.stopPropagation();
    const selectedArticleIds: number[] = [row.id!].filter((id): id is number => typeof id === 'number');
    console.log('>===>> TODO - delete single article:', selectedArticleIds);
    this.warnAndAskForConfirmation(selectedArticleIds);

  }

  // 260328 - Handler for deleting multiple selected articles (to be implemented)
  public onDeleteMultipleArticles(): void {
    const selectedArticleIds: number[] = this.$articles()
      .filter((row) => this.selectedDeleteRows().has(this.rowKey(row)))
      .map((row) => row.id)
      .filter((id): id is number => typeof id === 'number');
    console.log('>===>> TODO - delete multiple articles:', selectedArticleIds);
    this.warnAndAskForConfirmation(selectedArticleIds);

  }


  // 260328 - Show a confirmation dialog before deleting articles, and proceed with deletion if user confirms
  public async warnAndAskForConfirmation(articleIds: number[]): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dlgService.popup({
        token: 'conf',
        header: 'ATTENTION! Article(s) Deletion!',
        content: `Attention! You are about to delete the following article(s): \n${articleIds.join(', ')}.\n Please, confirm if you want to continue!`,
        posAnsMsg: 'No, keep them.',
        negAnsMsg: 'Yes, delete.',
        initialFocus: 1,
      })
    );
      if (confirmed) {
         console.log('>===>> User cancelled the delete action.');
         return
      }

      // !confirmed means the user clicked the negative button, which in this case is the "Yes, delete" option, because we want to make the user actively confirm deletion by clicking that button, while the positive button is the "No, keep them" option which is focused by default to prevent accidental deletions. 
      console.log('>===>> User confirmed deletion of articles:', articleIds);
      const res = await this.backendService.deleteArticlesByIds(articleIds);
      console.log('>===>> ArticlesTable - deleteArticlesByIds result:', res);
      if (res) {
        // Clear the delete selection after successful deletion
        this.selectedDeleteRows.set(new Set<RowKey>());
      }
      this.updateArticlesTable();

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
      if (result) {
        for (const articleId of selectedArticleIds) {
          this.setArticleCategoryIdsCache(articleId, selectedKeys);
        }
      }
      // 260328 - clear the selected checkboxes after the batch action is done:
      this.selectedCategoryRows.set(new Set<RowKey>());
      
      this.updateArticlesTable();
    });


  }

  private setArticleCategoryIdsCache(articleId: number, categoryIds: number[]): void {
    this.$articleCategoryIdsByArticleId.update((prev) => ({
      ...prev,
      [articleId]: [...categoryIds],
    }));
  }

  private prefetchCategoryStatusForVisibleRows(rows: PostData[]): void {
    // All rows are uncategorized in this mode, so no per-row fetch is required.
    if (this.filter === 'unassigned') {
      return;
    }

    const cached = this.$articleCategoryIdsByArticleId();

    for (const row of rows) {
      if (typeof row.id !== 'number') {
        continue;
      }

      const articleId = row.id;
      if (cached[articleId] !== undefined || this.categoryStatusLoadingIds.has(articleId)) {
        continue;
      }

      this.categoryStatusLoadingIds.add(articleId);

      this.backendService
        .getCategoryIdsOfAnArticle(articleId)
        .then((categoryIds) => {
          this.setArticleCategoryIdsCache(articleId, categoryIds ?? []);
        })
        .catch((err) => {
          console.error('>===>> ArticlesTable - prefetchCategoryStatusForVisibleRows error:', articleId, err);
        })
        .finally(() => {
          this.categoryStatusLoadingIds.delete(articleId);
        });
    }
  }

  isArticleUncategorized(row: PostData): boolean {
    if (this.filter === 'unassigned') {
      return true;
    }

    if (typeof row.id !== 'number') {
      return false;
    }

    const categoryIds = this.$articleCategoryIdsByArticleId()[row.id];
    if (categoryIds === undefined) {
      return false;
    }

    return categoryIds.length === 0;
  }


}