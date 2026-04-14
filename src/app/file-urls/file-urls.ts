import { Component, computed, effect, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormsModule, FormGroup, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { StyleDrct } from '../shared/style-drct';
import {
  extractAllNonImageUrls,
  getMediumSlugFromUrl,
} from '../../../shared/utils/shared-utils';
import {
  parseMultiGroupedLinks,
  MultiGroupedLinksParseResult,
  removeBlankLines,
  LinkGroup,
} from '../shared/utils/multi-grouped-links-parser';
import { DlgService } from '../shared/services/dlg-service';
import { Articlebasicscraper } from '../shared/services/articlebasicscraper';
import {
  Articlesmultiscraper,
  MultiScrapePrecheckSummary,
  MultiScrapePersistSummary,
} from '../shared/services/articlesmultiscraper';
import { ContentScrapePolicy } from '../shared/services/content-scrape-policy';
import { Category, PostData } from '../../../shared/projectObjects/varObjects';
import {
  NzTreeSelectComponent,
  NzTreeSelectModule,
} from 'ng-zorro-antd/tree-select';
import { NzTreeNodeOptions } from 'ng-zorro-antd/tree';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { CategoryNodes } from '../shared/services/category-nodes';
import { BackEnd } from '../shared/services/back-end';
import { firstValueFrom, Subscription } from 'rxjs';

@Component({
  selector: 'file-urls',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
    NzTreeSelectModule,
    NzIconModule,
    StyleDrct,
  ],
  templateUrl: './file-urls.html',
  styleUrl: './file-urls.scss',
})
export class FileUrls {
  public importedUrlsArrayString = signal<string>('');
  public precheckSummary = signal<MultiScrapePrecheckSummary | null>(null);
  public isImportedUrlsDropActive = signal<boolean>(false);
  public overwriteExisting = false;

  public urlsArray = signal<string[]>([]);
  public urlsArrayString = signal<string>('');

  public scrappedDataArray = signal<PostData[]>([]);
  public scrappedDataArrayString = signal<string>('');

  public fileName: string = '';
  // public mycond: boolean = false;
  public customStyles = {
    color: 'dimgray',
    // backgroundColor: 'teal',
    // fontSize: '20px',
    // padding: '10px'
  };

  // Multi-grouped-links tracking: parsed groups with their category assignments
  private linkGroups: LinkGroup[] = [];
  private multiGroupedParseResult: MultiGroupedLinksParseResult | null = null;

  private dlgService = inject(DlgService);
  private scrapper = inject(Articlebasicscraper);
  private articlesmultiscraper = inject(Articlesmultiscraper);
  private contentScrapePolicy = inject(ContentScrapePolicy);
  private fb = inject(NonNullableFormBuilder);
  private categoryNodesService = inject(CategoryNodes);
  private backendService = inject(BackEnd);

  // private fileDropService = inject(FikeDrop);
  // filePath = this.fileDropService.$filePath;

  public $categoryNodes = signal<NzTreeNodeOptions[]>([]);
  public selectedCategoryIds: number[] = [];
  private categoryChangesSubscription?: Subscription;
  private dropdownScrollElement?: Element;
  private treeScrollFrameId?: number;
  private importedUrlsPrecheckSeq = 0;
  public $categorySearchText = signal<string>('');

  public $matchesCount = computed(() => {
    const searchTerm = this.$categorySearchText().toLowerCase().trim();
    if (!searchTerm) return 0;
    return this.countMatches(this.categoryNodesService.$catTreeNodes(), searchTerm);
  });

  public $categoryNodesWithSearch = computed(() => {
    const searchTerm = this.$categorySearchText().toLowerCase().trim();
    const originalNodes = this.categoryNodesService.$catTreeNodes();
    if (!searchTerm) return originalNodes;
    return this.setExpandedNodesForSearch(originalNodes, searchTerm);
  });

  public categorySelectForm: FormGroup = this.fb.group({
    selectCategory: this.fb.control<string[]>([]),
  });

  @ViewChild('catSel', { static: false }) catSel!: NzTreeSelectComponent;
  @ViewChild('searchInput', { static: false }) searchInput!: ElementRef<HTMLInputElement>;

  constructor() {
    effect(() => {
      this.$categoryNodes.set(this.categoryNodesService.$catTreeNodes());
    });
    if (this.categoryNodesService.$catTreeNodes().length === 0) {
      this.categoryNodesService.setCategoryTreeNodesSignal();
    }
  }

  async onScrape(): Promise<void> {
    let loading = true;
    let result: PostData[] = [];
    let error = null;

    const urls = this.urlsArray();
    if (!urls.length) return;

    try {
      const existingSlugSet = await this.getExistingSlugSet();
      const hasGroupedLinks =
        this.multiGroupedParseResult?.isMultiGrouped === true &&
        this.linkGroups.length > 0;

      let persistSummary: MultiScrapePersistSummary;
      let existingSlugMatches = 0;

      if (hasGroupedLinks) {
        const groupedOutcome = await this.scrapeAndPersistPerGroup(existingSlugSet);
        result = groupedOutcome.scrapedPosts;
        persistSummary = groupedOutcome.summary;
        existingSlugMatches = groupedOutcome.existingSlugMatches;
      } else {
        const plainUrlsPreparation = this.prepareUrlsForScrape(urls, existingSlugSet);
        existingSlugMatches = plainUrlsPreparation.existingSlugMatches;

        if (plainUrlsPreparation.urlsToScrape.length === 0) {
          this.scrappedDataArray.set([]);
          this.scrappedDataArrayString.set('');
          this.showScrapeCompletedDialog(
            {
              totalScraped: 0,
              insertedCount: 0,
              updatedCount: 0,
              skippedCount: 0,
            },
            existingSlugMatches
          );
          return;
        }

        const scrapeOptions = this.contentScrapePolicy.buildScrapeTabsOptions(
          plainUrlsPreparation.urlsToScrape
        );
        const response = await this.scrapper.scrapeTabsList(
          plainUrlsPreparation.urlsToScrape,
          scrapeOptions
        );
        if (!response.success) {
          error = response.error;
          return;
        }

        const scrapedPosts = (response.data as PostData[]) || [];
        result = scrapedPosts.filter((post) => !post.excludeFromPersistence);
        this.scrappedDataArray.set(result);
        persistSummary = await this.persistScrapedArticlesByCategory();
      }

      if (this.scrappedDataArray().length > 0) {
        this.scrappedDataArrayString.set(
          JSON.stringify(this.scrappedDataArray(), null, 2)
        );
      } else {
        this.scrappedDataArrayString.set('');
      }

      this.showScrapeCompletedDialog(persistSummary, existingSlugMatches);
    } catch (err) {
      error = err;
    } finally {
      loading = false;
    }
  }

  onGetFileUrls() {
    this.getFileFromElectron().catch((err) =>
      console.error('Unexpected error calling Electron:', err)
    );
  }

  onImportedUrlsTextChanged(rawText: string): void {
    const normalized = rawText ?? '';
    this.importedUrlsArrayString.set(normalized);

    const urls = this.extractUniqueUrls(normalized);
    this.urlsArray.set(urls);

    // Keep summary consistent with current textarea input.
    this.precheckSummary.set(null);
  }

  async onImportedUrlsPaste(event: ClipboardEvent): Promise<void> {
    event.preventDefault();
    const rawPastedText = event.clipboardData?.getData('text/plain') ?? '';

    // Remove blank lines from the beginning
    const textWithoutBlanks = removeBlankLines(rawPastedText);

    // Attempt to parse as multi-grouped-links and optionally create missing child categories
    await this.parseAndTrackMultiGroupedLinks(textWithoutBlanks);

    // Sanitize for insertion
    const cleanedPastedText = this.sanitizePastedUrlsText(textWithoutBlanks);
    if (!cleanedPastedText) {
      return;
    }

    const textarea = event.target as HTMLTextAreaElement | null;
    const mergedText = this.mergeTextAtCursor(textarea, cleanedPastedText);

    this.onImportedUrlsTextChanged(mergedText);
    void this.refreshPrecheckSummaryForTextarea();
  }

  onImportedUrlsDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isImportedUrlsDropActive.set(true);
  }

  onImportedUrlsDragLeave(): void {
    this.isImportedUrlsDropActive.set(false);
  }

  onImportedUrlsDrop(event: DragEvent): void {
    event.preventDefault();
    this.isImportedUrlsDropActive.set(false);

    const droppedText = this.extractTextFromDataTransfer(event.dataTransfer);
    if (!droppedText.trim()) {
      return;
    }

    const textarea = event.target as HTMLTextAreaElement | null;
    const mergedText = this.mergeTextAtCursor(textarea, droppedText);
    this.onImportedUrlsTextChanged(mergedText);
    void this.refreshPrecheckSummaryForTextarea();
  }

  private async getFileFromElectron(): Promise<void> {
    const dlgOptions = {
      title: 'Open .txt or .json Files',
      filters: [{ name: 'Text and JSON', extensions: ['txt', 'json'] }],
    };
    try {
      const result = (await window.electronAPI.invoke(
        'open-file-dialog',
        dlgOptions
      )) as {
        success: boolean;
        message: string;
        filePath?: string;
        error?: string;
      };

      console.log('>===>> File selected: ', result.filePath);

      if (result.success && result.filePath) {
        this.fileName = result.filePath!;
        this.getDataFromFile(this.fileName);
      }
    } catch (err) {
      console.error('IPC open-file-dialog invoke failed:', err);
    }
  }

  private async getDataFromFile(filePathName: string) {
    console.log('>===>> File to be read: ', filePathName);

    let data: string = '';

    try {
      // Read Data
      data = (await window.electronAPI.invoke(
        'read-file-data',
        filePathName
      )) as string;
      if (data.length === 0) {
        console.log('No Data read from File!');
        return;
      }
      console.log('Data read from File: ', data);

      //Extract URLs
      const uniqueURLs = this.extractUniqueUrls(data);
      this.urlsArray.set(uniqueURLs);

      const precheck = await this.articlesmultiscraper.summarizeUrlsAgainstDb(
        uniqueURLs
      );
      this.precheckSummary.set(precheck);

      // Show message in modal dialog
      const msg: string =
        `URLs found in total: ${precheck.totalUrls}\n` +
        `Unique URLs: ${precheck.uniqueUrls.length}\n` +
        `New articles to insert: ${precheck.newCount}\n` +
        `Existing same-slug articles: ${precheck.existingSlugCount}` +
        (precheck.duplicateUrlCount > 0
          ? `\nDuplicate URLs in file: ${precheck.duplicateUrlCount}`
          : '');
      this.dlgService
        .popup({
          token: 'info',
          header: 'URLs Found!',
          content: msg,
          posAnsMsg: 'OK',
          negAnsMsg: '',
        })
        .subscribe((result) => {
          console.log('Dialog closed with:', result);
        });

      const lbStringUrls = this.urlsArray().join('\n');
      this.importedUrlsArrayString.set(lbStringUrls);
    } catch (error) {
      console.log('Error reading Data from File:', error);
    }
  }

  onClearScrapedData() {
    this.scrappedDataArray.set([]);
    this.scrappedDataArrayString.set('');
    this.importedUrlsArrayString.set('');
    this.precheckSummary.set(null);
    this.isImportedUrlsDropActive.set(false);
    this.overwriteExisting = false;
    this.fileName = '';
    this.selectedCategoryIds = [];
    this.categorySelectForm.reset({ selectCategory: [] });
    this.$categorySearchText.set('');
    // Clear multi-grouped-links tracking
    this.linkGroups = [];
    this.multiGroupedParseResult = null;
  }

  private extractUniqueUrls(rawText: string): string[] {
    const urls = extractAllNonImageUrls(rawText ?? '');
    return Array.from(
      new Set(urls.map((url) => (url ?? '').trim()).filter((url) => url.length > 0))
    );
  }

  // 260406 - New URL sanitization to remove query parameters and trim whitespace, applied on paste and drop to improve DB matching and precheck accuracy
  private sanitizePastedUrlsText(rawText: string): string {
    const cleanedUrls = this.extractUniqueUrls(rawText)
      .map((url) => this.removeUrlQuery(url))
      .filter((url) => url.length > 0);

    const uniqueCleanedUrls = Array.from(new Set(cleanedUrls));

    return uniqueCleanedUrls.join('\n');
  }

  private removeUrlQuery(url: string): string {
    const trimmedUrl = (url ?? '').trim();
    if (!trimmedUrl) {
      return '';
    }

    const queryStartIndex = trimmedUrl.indexOf('?');
    return queryStartIndex >= 0
      ? trimmedUrl.slice(0, queryStartIndex)
      : trimmedUrl;
  }

  private extractTextFromDataTransfer(dataTransfer: DataTransfer | null): string {
    if (!dataTransfer) {
      return '';
    }

    const uriList = dataTransfer.getData('text/uri-list') ?? '';
    const plain = dataTransfer.getData('text/plain') ?? '';
    const html = dataTransfer.getData('text/html') ?? '';

    return [uriList, plain, html].filter((chunk) => !!chunk).join('\n');
  }

  private mergeTextAtCursor(textarea: HTMLTextAreaElement | null, incoming: string): string {
    const current = this.importedUrlsArrayString();
    if (!incoming.trim()) {
      return current;
    }

    if (!textarea) {
      return [current, incoming]
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .join('\n');
    }

    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);

    return `${before}${incoming}${after}`;
  }

  private async refreshPrecheckSummaryForTextarea(): Promise<void> {
    const urls = this.urlsArray();
    if (urls.length === 0) {
      this.precheckSummary.set(null);
      return;
    }

    const requestSeq = ++this.importedUrlsPrecheckSeq;
    const precheck = await this.articlesmultiscraper.summarizeUrlsAgainstDb(urls);

    if (requestSeq !== this.importedUrlsPrecheckSeq) {
      return;
    }

    this.precheckSummary.set(precheck);
  }

  private showScrapeCompletedDialog(
    persistSummary: MultiScrapePersistSummary,
    existingSlugMatches: number
  ): void {
    const overwriteLine = this.overwriteExisting
      ? `Re-scraped existing same-slug URLs: ${existingSlugMatches}`
      : `Excluded existing same-slug URLs before scrape: ${existingSlugMatches}`;

    this.dlgService
      .popup({
        token: 'info',
        header: 'File URL Scraping Completed',
        content:
          `${overwriteLine}\n` +
          `Inserted new articles: ${persistSummary.insertedCount}\n` +
          `Updated existing articles: ${persistSummary.updatedCount}\n` +
          `Skipped unchanged/newer DB articles: ${persistSummary.skippedCount}`,
        posAnsMsg: 'OK',
        negAnsMsg: '',
      })
      .subscribe((dlgResult) => {
        console.log('Dialog closed with:', dlgResult);
      });
  }

  private async getExistingSlugSet(): Promise<Set<string>> {
    const existingArticles = await this.backendService.getAllArticles();
    const existingSlugSet = new Set<string>();

    for (const article of existingArticles) {
      const slug = getMediumSlugFromUrl(article.link);
      if (slug) {
        existingSlugSet.add(slug);
      }
    }

    return existingSlugSet;
  }

  private prepareUrlsForScrape(
    urls: string[],
    existingSlugSet: Set<string>
  ): { urlsToScrape: string[]; existingSlugMatches: number } {
    const uniqueNormalizedUrls = Array.from(
      new Set(
        (urls ?? [])
          .map((url) => this.removeUrlQuery((url ?? '').trim()))
          .filter((url) => url.length > 0)
      )
    );

    let existingSlugMatches = 0;
    const urlsToScrape: string[] = [];

    for (const url of uniqueNormalizedUrls) {
      const slug = getMediumSlugFromUrl(url);
      const existsInDb = !!slug && existingSlugSet.has(slug);

      if (existsInDb) {
        existingSlugMatches++;
      }

      if (!existsInDb || this.overwriteExisting) {
        urlsToScrape.push(url);
      }
    }

    return { urlsToScrape, existingSlugMatches };
  }

  onCopyScrapedData() {
    if (this.scrappedDataArrayString().length === 0) return;
    const scrappedDataString = this.scrappedDataArrayString();
    if (scrappedDataString) {
      navigator.clipboard
        .writeText(scrappedDataString)
        .then(() => {
          console.log('Scrapped data copied to clipboard');
        })
        .catch((err) => {
          console.error('Failed to copy scrapped data: ', err);
        });
    } else {
      console.warn('No scrapped data to copy');
    }
  }

  onSaveScrapedData() {
    if (this.scrappedDataArray().length > 0) {
      this.runSaveScappedData();
    }
  }

  async runSaveScappedData() {
    try {
      if (this.scrappedDataArray().length > 0) {
        const result = await window.electronAPI.invoke(
          'save-scrapped-data',
          this.scrappedDataArrayString()
        );
      }
    } catch (error) {
      console.error('Error saving scrapped data:', error);
    }
  }

  ngAfterViewInit() {
    this.categoryChangesSubscription = this.categorySelectForm.controls[
      'selectCategory'
    ].valueChanges.subscribe((keys: string[]) => {
      this.selectedCategoryIds = keys
        .map((key) => parseInt(key, 10))
        .filter((id) => !isNaN(id));
      console.log('>===>> FileUrls - selectedCategoryIds:', this.selectedCategoryIds);
    });
  }

  ngOnDestroy() {
    this.categoryChangesSubscription?.unsubscribe();
    this.unbindDropdownScrollHighlight();
    if (this.treeScrollFrameId) {
      cancelAnimationFrame(this.treeScrollFrameId);
    }
  }

  clearCategorySearch(): void {
    this.$categorySearchText.set('');
    this.clearTreeHighlights();
  }

  onCategorySearchChange(value: string): void {
    this.$categorySearchText.set(value);
    if (value.trim().length > 0 && this.catSel && !this.catSel.nzOpen) {
      setTimeout(() => {
        if (this.catSel && !this.catSel.nzOpen) {
          this.catSel.openDropdown();
        }
      }, 100);
    } else if (value.trim().length > 0 && this.catSel && this.catSel.nzOpen) {
      this.highlightTreeNodes(value);
    } else if (value.trim().length === 0) {
      this.clearTreeHighlights();
    }
  }

  onSearchInputFocus(): void {
    const searchText = this.$categorySearchText();
    if (searchText && searchText.trim().length > 0 && this.catSel && !this.catSel.nzOpen) {
      setTimeout(() => {
        if (this.catSel && !this.catSel.nzOpen) {
          this.catSel.openDropdown();
        }
      }, 100);
    }
  }

  onTreeOpenChange(isOpen: boolean): void {
    if (isOpen) {
      const searchText = this.$categorySearchText();
      this.bindDropdownScrollHighlight();
      if (searchText) {
        setTimeout(() => this.highlightTreeNodes(searchText), 200);
      }

      setTimeout(() => {
        if (this.searchInput) {
          this.searchInput.nativeElement.focus();
        }
      }, 300);
    } else {
      this.unbindDropdownScrollHighlight();
      this.clearTreeHighlights();
    }
  }

  openTreeSelect(): void {
    if (this.catSel) {
      this.catSel.openDropdown();
    }
  }

  private setExpandedNodesForSearch(nodes: NzTreeNodeOptions[], searchTerm: string): NzTreeNodeOptions[] {
    return nodes.map((node) => {
      const nodeMatches = node.title?.toString().toLowerCase().includes(searchTerm);
      const hasMatchingChildren = node.children
        ? this.hasMatchingDescendants(node.children, searchTerm)
        : false;

      return {
        ...node,
        expanded: nodeMatches || hasMatchingChildren,
        children: node.children
          ? this.setExpandedNodesForSearch(node.children, searchTerm)
          : undefined,
      };
    });
  }

  private hasMatchingDescendants(nodes: NzTreeNodeOptions[], searchTerm: string): boolean {
    return nodes.some((node) => {
      const nodeMatches = node.title?.toString().toLowerCase().includes(searchTerm);
      const childrenMatch = node.children
        ? this.hasMatchingDescendants(node.children, searchTerm)
        : false;
      return nodeMatches || childrenMatch;
    });
  }

  private countMatches(nodes: NzTreeNodeOptions[], searchTerm: string): number {
    let count = 0;
    for (const node of nodes) {
      if (node.title?.toString().toLowerCase().includes(searchTerm)) {
        count++;
      }
      if (node.children) {
        count += this.countMatches(node.children, searchTerm);
      }
    }
    return count;
  }

  private highlightTreeNodes(searchText: string): void {
    if (!searchText) {
      this.clearTreeHighlights();
      return;
    }

    this.clearTreeHighlights();

    setTimeout(() => {
      const possibleSelectors = [
        '.file-urls-category-dropdown',
        '.ant-tree-select-dropdown',
        '.ant-select-dropdown',
      ];

      let treeDropdown: Element | null = null;
      for (const selector of possibleSelectors) {
        treeDropdown = document.querySelector(selector);
        if (treeDropdown) break;
      }

      if (!treeDropdown) return;

      const titleNodes = treeDropdown.querySelectorAll('.ant-tree-title');
      if (titleNodes.length === 0) return;

      const searchLower = searchText.toLowerCase();

      Array.from(titleNodes).forEach((titleElement: Element) => {
        const text = titleElement.textContent?.trim().toLowerCase() || '';
        const wrapperElement =
          titleElement.closest('nz-tree-node') ||
          titleElement.closest('[class*="tree-treenode"]') ||
          titleElement.closest('.ant-select-tree-treenode') ||
          titleElement.parentElement;

        if (text.includes(searchLower) && wrapperElement) {
          wrapperElement.setAttribute('data-highlighted', 'true');
          wrapperElement.classList.add('search-highlighted');

          const wrapperHtml = wrapperElement as HTMLElement;
          wrapperHtml.style.backgroundColor = 'rgba(176, 224, 230, 0.7)';
          wrapperHtml.style.borderLeft = '4px solid #fa8c16';
          wrapperHtml.style.borderRadius = '2px';

          const titleHtml = titleElement as HTMLElement;
          titleHtml.style.color = '#fa8c16';
          titleHtml.style.fontWeight = '600';
        }
      });
    }, 250);
  }

  private bindDropdownScrollHighlight(): void {
    this.unbindDropdownScrollHighlight();

    setTimeout(() => {
      const scrollElement = document.querySelector(
        '.file-urls-category-dropdown .cdk-virtual-scroll-viewport, .file-urls-category-dropdown .ant-select-tree-list-holder'
      );

      if (!scrollElement) {
        return;
      }

      this.dropdownScrollElement = scrollElement;
      this.dropdownScrollElement.addEventListener('scroll', this.handleDropdownScroll, {
        passive: true,
      });
    }, 250);
  }

  private unbindDropdownScrollHighlight(): void {
    if (this.dropdownScrollElement) {
      this.dropdownScrollElement.removeEventListener('scroll', this.handleDropdownScroll);
      this.dropdownScrollElement = undefined;
    }
  }

  private handleDropdownScroll = (): void => {
    if (this.treeScrollFrameId) {
      cancelAnimationFrame(this.treeScrollFrameId);
    }

    this.treeScrollFrameId = requestAnimationFrame(() => {
      this.treeScrollFrameId = undefined;
      const searchText = this.$categorySearchText().trim();
      if (!searchText) {
        this.clearTreeHighlights();
        return;
      }
      this.highlightTreeNodes(searchText);
    });
  };

  private clearTreeHighlights(): void {
    const highlightedNodes = document.querySelectorAll(
      '[data-highlighted="true"], .search-highlighted'
    );

    Array.from(highlightedNodes).forEach((node) => {
      node.removeAttribute('data-highlighted');
      node.classList.remove('search-highlighted');

      const nodeHtml = node as HTMLElement;
      nodeHtml.style.backgroundColor = '';
      nodeHtml.style.borderLeft = '';
      nodeHtml.style.borderRadius = '';

      const titleElement = node.querySelector('.ant-tree-title, [class*="title"]');
      if (titleElement) {
        const titleHtml = titleElement as HTMLElement;
        titleHtml.style.color = '';
        titleHtml.style.fontWeight = '';
      }
    });
  }

  // ============ Multi-Grouped-Links Parsing & Tracking ============

  /**
   * Parses raw pasted text (already blank-line-stripped) and stores the resulting
   * LinkGroup array for use during scraping.
   * No-op when no mother category is selected.
   */
  private async parseAndTrackMultiGroupedLinks(rawText: string): Promise<void> {
    if (this.selectedCategoryIds.length === 0) {
      this.linkGroups = [];
      this.multiGroupedParseResult = null;
      return;
    }

    const motherCategoryId = this.selectedCategoryIds[0];
    const childCategories = this.getChildCategoriesMap(motherCategoryId);

    let parseResult = parseMultiGroupedLinks(rawText, motherCategoryId, childCategories);

    if (parseResult.isMultiGrouped) {
      parseResult = await this.tryCreateMissingChildCategoriesAndReparse(
        rawText,
        motherCategoryId,
        childCategories,
        parseResult
      );
    }

    this.multiGroupedParseResult = parseResult;
    this.linkGroups = parseResult.groups;

    if (parseResult.isMultiGrouped) {
      const matched = parseResult.groups
        .filter((g) => g.header !== 'orphan')
        .map((g) => `"${g.header}" → categoryId ${g.categoryId} (links: ${g.urls.length})`)
        .join(', ');
      console.log('>===>> Multi-grouped-links detected. Groups:', matched);
    }
  }

  private async tryCreateMissingChildCategoriesAndReparse(
    rawText: string,
    motherCategoryId: number,
    childCategories: Map<number, string>,
    parseResult: MultiGroupedLinksParseResult
  ): Promise<MultiGroupedLinksParseResult> {
    const unmatchedLabels = this.getUnmatchedGroupLabels(parseResult.groups, motherCategoryId);
    if (unmatchedLabels.length === 0) {
      return parseResult;
    }

    const confirmContent =
      `Unmatched grouping labels found:\n` +
      unmatchedLabels.map((label) => `- ${label}`).join('\n') +
      `\n\nDo you want to add new child categories found from the text-labels?`;

    const confirmed = await firstValueFrom(
      this.dlgService.popup({
        token: 'conf',
        header: 'Create Missing Child Categories?',
        content: confirmContent,
        posAnsMsg: 'Yes',
        negAnsMsg: 'No',
      })
    );

    if (!confirmed) {
      return parseResult;
    }

    const createdCategories = await this.createChildCategoriesFromLabels(
      motherCategoryId,
      unmatchedLabels
    );

    const latestDirectChildren = await this.backendService.getCategoriesByParentId(
      motherCategoryId
    );
    for (const child of latestDirectChildren) {
      if (typeof child.id === 'number' && (child.name ?? '').trim().length > 0) {
        childCategories.set(child.id, child.name);
      }
    }

    this.categoryNodesService.setCategoryTreeNodesSignal();

    if (createdCategories.length > 0) {
      console.log('>===>> Multi-grouped-links: created child categories:', createdCategories);
    }

    return parseMultiGroupedLinks(rawText, motherCategoryId, childCategories);
  }

  private getUnmatchedGroupLabels(groups: LinkGroup[], motherCategoryId: number): string[] {
    const labels = groups
      .filter((group) => group.header !== 'orphan' && group.categoryId === motherCategoryId)
      .map((group) => (group.header ?? '').trim())
      .filter((label) => label.length > 0);

    return Array.from(new Set(labels));
  }

  private async createChildCategoriesFromLabels(
    motherCategoryId: number,
    labels: string[]
  ): Promise<Category[]> {
    const created: Category[] = [];

    for (const label of labels) {
      try {
        const category = (await this.backendService.addNewCategory(
          label,
          motherCategoryId
        )) as Category | null;

        if (category && typeof category.id === 'number') {
          created.push(category);
        }
      } catch (error) {
        console.warn('>===>> Failed to create child category from label:', label, error);
      }
    }

    return created;
  }

  /**
   * Retrieves child categories of a given parent category from the category tree.
   * Returns a Map of categoryId → categoryName for all direct and indirect children.
   */
  private getChildCategoriesMap(parentCategoryId: number): Map<number, string> {
    const childMap = new Map<number, string>();

    const collectChildren = (nodes: NzTreeNodeOptions[], parentKey: string) => {
      for (const node of nodes) {
        if (node.key === parentKey && node.children) {
          const collectAllDescendants = (ancestorNodes: NzTreeNodeOptions[]) => {
            for (const child of ancestorNodes) {
              const childId = parseInt(child.key as string, 10);
              if (!isNaN(childId)) {
                childMap.set(childId, (child.title as string) ?? '');
              }
              if (child.children) {
                collectAllDescendants(child.children);
              }
            }
          };
          collectAllDescendants(node.children);
        } else if (node.children) {
          collectChildren(node.children, parentKey);
        }
      }
    };

    const treeNodes = this.$categoryNodes();
    collectChildren(treeNodes, String(parentCategoryId));

    return childMap;
  }

  /**
   * Persists scraped articles for the plain-URL flow.
   *
   * Grouped mode is handled separately by scrapeAndPersistPerGroup(), so this
   * method is only used when there is no multi-grouped parse result.
   */
  private async persistScrapedArticlesByCategory(): Promise<MultiScrapePersistSummary> {
    const dataArray = this.scrappedDataArray().filter((item) => !item.excludeFromPersistence);
    if (dataArray.length === 0) {
      return { totalScraped: 0, insertedCount: 0, updatedCount: 0, skippedCount: 0 };
    }

    const result = await this.articlesmultiscraper.persistScrapedArticlesWithDedup(
      dataArray,
      this.selectedCategoryIds,
      this.overwriteExisting ? 'overwriteExisting' : 'insertOnlyNew'
    );

    return {
      totalScraped: dataArray.length,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
    };
  }

  /**
   * Grouped-mode flow: scrape each parsed group separately and persist with that
   * group's category id. This avoids cross-group matching issues caused by
   * all-links-in-one scrape/persist processing.
   */
  private async scrapeAndPersistPerGroup(existingSlugSet: Set<string>): Promise<{
    scrapedPosts: PostData[];
    summary: MultiScrapePersistSummary;
    existingSlugMatches: number;
  }> {
    const allScrapedPersistable: PostData[] = [];
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalExistingSlugMatches = 0;

    for (const group of this.linkGroups) {
      const preparedGroupUrls = this.prepareUrlsForScrape(group.urls, existingSlugSet);
      const groupUrls = preparedGroupUrls.urlsToScrape;
      totalExistingSlugMatches += preparedGroupUrls.existingSlugMatches;

      if (preparedGroupUrls.existingSlugMatches > 0) {
        console.log('>===>> Group existing-slug precheck:', {
          header: group.header,
          categoryId: group.categoryId,
          existingSlugMatches: preparedGroupUrls.existingSlugMatches,
          overwriteExisting: this.overwriteExisting,
        });
      }

      if (groupUrls.length === 0) {
        console.log('>===>> Group scrape skipped before scraping:', {
          header: group.header,
          categoryId: group.categoryId,
          reason: this.overwriteExisting
            ? 'no-urls-after-normalization'
            : 'all-urls-already-exist-in-db',
        });
        continue;
      }

      console.log('>===>> Group scrape starting:', {
        header: group.header,
        categoryId: group.categoryId,
        urlCount: groupUrls.length,
      });

      const scrapeOptions = this.contentScrapePolicy.buildScrapeTabsOptions(groupUrls);
      const response = await this.scrapper.scrapeTabsList(groupUrls, scrapeOptions);
      if (!response.success) {
        console.warn(
          '>===>> Group scrape failed for header:',
          group.header,
          'error:',
          response.error
        );
        continue;
      }

      const scrapedPosts = (response.data as PostData[]) || [];
      const persistablePosts = scrapedPosts.filter((post) => !post.excludeFromPersistence);

      console.log('>===>> Group scrape completed:', {
        header: group.header,
        categoryId: group.categoryId,
        urlCount: groupUrls.length,
        scrapedCount: persistablePosts.length,
      });

      if (persistablePosts.length === 0) {
        console.log('>===>> Group persist skipped:', {
          header: group.header,
          categoryId: group.categoryId,
          insertedCount: 0,
          updatedCount: 0,
          skippedCount: 0,
        });
        continue;
      }

      allScrapedPersistable.push(...persistablePosts);

      const result = await this.articlesmultiscraper.persistScrapedArticlesWithDedup(
        persistablePosts,
        [group.categoryId],
        this.overwriteExisting ? 'overwriteExisting' : 'insertOnlyNew'
      );

      console.log('>===>> Group persist completed:', {
        header: group.header,
        categoryId: group.categoryId,
        urlCount: groupUrls.length,
        scrapedCount: persistablePosts.length,
        insertedCount: result.insertedCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
      });

      totalInserted += result.insertedCount;
      totalUpdated += result.updatedCount;
      totalSkipped += result.skippedCount;
    }

    this.scrappedDataArray.set(allScrapedPersistable);

    console.log('>===>> Grouped scrape summary:', {
      groupCount: this.linkGroups.length,
      scrapedCount: allScrapedPersistable.length,
      insertedCount: totalInserted,
      updatedCount: totalUpdated,
      skippedCount: totalSkipped,
    });

    return {
      scrapedPosts: allScrapedPersistable,
      summary: {
        totalScraped: allScrapedPersistable.length,
        insertedCount: totalInserted,
        updatedCount: totalUpdated,
        skippedCount: totalSkipped,
      },
      existingSlugMatches: totalExistingSlugMatches,
    };
  }











  
}
