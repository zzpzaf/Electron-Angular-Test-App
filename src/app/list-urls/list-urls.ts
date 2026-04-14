import { Component, computed, effect, ElementRef, inject, signal, ViewChild } from '@angular/core';
import {
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  FormsModule,
} from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';

import { Articlebasicscraper } from '../shared/services/articlebasicscraper';
import {
  listURLData,
  PostData,
} from '../../../shared/projectObjects/varObjects'; // Import the PostData interface
import {
  analyzeListedLink,
  getMediumSlugFromUrl,
  isValidUrl,
} from '../../../shared/utils/shared-utils';
import { LIST_MAX_ARTICLES_DEFAULT } from '../../../shared/constants';

import { DlgService } from '../shared/services/dlg-service';

import {
  NzTreeSelectComponent,
  NzTreeSelectModule,
} from 'ng-zorro-antd/tree-select';
import { CategoryNodes } from '../shared/services/category-nodes';
import { NzTreeNodeOptions } from 'ng-zorro-antd/tree';
import { BackEnd } from '../shared/services/back-end';
import { debounceTime, distinctUntilChanged, firstValueFrom, Subscription } from 'rxjs';
import { LoaderService } from '../shared/services/loader-service';
import { NzIconModule } from 'ng-zorro-antd/icon';
import {
  Articlesmultiscraper,
  MultiScrapePersistMode,
  MultiScrapePrecheckSummary,
} from '../shared/services/articlesmultiscraper';    // 260325
import { ContentScrapePolicy } from '../shared/services/content-scrape-policy';

// Adjust the import path as necessary

@Component({
  selector: 'list-urls',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
    NzTreeSelectModule,
    NzIconModule,
  ],
  templateUrl: './list-urls.html',
  styleUrl: './list-urls.scss',
})
export class ListUrls {
  private fb = inject(NonNullableFormBuilder);
  public linkScrapeForm!: FormGroup;
  private articlebasicscraper = inject(Articlebasicscraper);
  private articlesmultiscraper = inject(Articlesmultiscraper);    // 260325
  // public scrappedData = "";
  public scrappedError = signal<string>('');
  public scrappedData = signal<PostData | null>(null);
  public $scrappedDataArray = signal<PostData[]>([]);
  public $scrappedDataArrayString = signal<string>('');
  public precheckSummary = signal<MultiScrapePrecheckSummary | null>(null);
  public linkURL = signal<string>('');
  public $declaredTotal = signal<number | null>(null);
  public $declaredTotalLoading = signal<boolean>(false);
  public readonly listMaxArticlesDefault = LIST_MAX_ARTICLES_DEFAULT;
  public listChunkSizeDefault = 250;
  private declaredTotalReqSeq = 0;
  private listurldata: listURLData = { listname: '', pubauthorslug: '' };

  // private modal = inject(NzModalService);
  private dlgService = inject(DlgService);

  private backendService = inject(BackEnd);
  private categoryNodesService = inject(CategoryNodes);
  public $categoryNodes = signal<NzTreeNodeOptions[]>([]);
  private categoryChangesSubscription?: Subscription;
 
  public selectedCategoryIds: number[] = [];
  private loader = inject(LoaderService);
  private contentScrapePolicy = inject(ContentScrapePolicy);


    /** Search functionality signals */
  public $categorySearchText = signal<string>('');
  
  /** Computed signal for matches count */
  public $matchesCount = computed(() => {
    const searchTerm = this.$categorySearchText().toLowerCase().trim();
    if (!searchTerm) return 0;
    
    // Count matches in the tree nodes
    return this.countMatches(this.categoryNodesService.$catTreeNodes(), searchTerm);
  });
  
  /** Computed signal for category nodes with search-based expansion */
  public $categoryNodesWithSearch = computed(() => {
    const searchTerm = this.$categorySearchText().toLowerCase().trim();
    const originalNodes = this.categoryNodesService.$catTreeNodes();
    
    if (!searchTerm) return originalNodes;
    
    // Return all nodes but with expanded state based on search matches
    return this.setExpandedNodesForSearch(originalNodes, searchTerm);
  });

  @ViewChild('catSel', { static: false }) catSel!: NzTreeSelectComponent;
  @ViewChild('searchInput', { static: false }) searchInput!: ElementRef<HTMLInputElement>;
  

  constructor() {
    effect(() => {
      this.$categoryNodes.set(this.categoryNodesService.$catTreeNodes());
    });
  }

  ngOnInit(): void {
    this.setupForm();

    void this.loadListScrapeConfig();

    if (this.categoryNodesService.$catTreeNodes().length === 0) {
      this.categoryNodesService.setCategoryTreeNodesSignal();
    }
    console.log(
      '>===>> Category tree nodes: ',
      this.categoryNodesService.$catTreeNodes().length
    );

    this.linkScrapeForm.get('url')?.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(async (rawUrlValue) => {
        const urlValue = (rawUrlValue || '').trim();
        this.linkURL.set(urlValue);
        this.precheckSummary.set(null);

        // For each new URL input, reset to default baseline until declared total is fetched.
        this.$declaredTotalLoading.set(false);
        this.$declaredTotal.set(null);
        this.linkScrapeForm
          .get('maxArticles')
          ?.setValue(LIST_MAX_ARTICLES_DEFAULT, { emitEvent: false });

        this.listurldata = { listname: '', pubauthorslug: '' };
        if (urlValue.length === 0 || !isValidUrl(urlValue)) {
          return;
        }

        console.log('URL changed to:', this.linkURL());
        this.listurldata = analyzeListedLink(urlValue);

        // Only Medium list URLs should trigger declared-total fetch.
        if (this.listurldata.listname.trim().length === 0) {
          return;
        }

        const reqSeq = ++this.declaredTotalReqSeq;
        this.$declaredTotalLoading.set(true);
        const declaredResp = await this.articlebasicscraper.getListDeclaredTotal(urlValue);

        // Drop stale responses when user already changed URL again.
        if (reqSeq !== this.declaredTotalReqSeq || this.linkURL() !== urlValue) {
          this.$declaredTotalLoading.set(false);
          return;
        }

        if (declaredResp.success && typeof declaredResp.declaredTotal === 'number') {
          const declaredTotal = declaredResp.declaredTotal;
          this.$declaredTotal.set(declaredTotal);

          const initialMax = Math.min(LIST_MAX_ARTICLES_DEFAULT, declaredTotal);
          this.linkScrapeForm
            .get('maxArticles')
            ?.setValue(initialMax, { emitEvent: false });
        }
        this.$declaredTotalLoading.set(false);
      });

    // It captures directly any Electron message sent and passed via the "message-channel"
    window.electronAPI.on('message-channel', (message: string) => {
      const msg: string = 'ELECTRON --> : ' + message;
      // It calls the dlgService to pop-up an error message:
      // this.testError(msg);
      this.dlgService
        .popup({
          token: 'error',
          header: 'Error!',
          content: msg,
          posAnsMsg: 'OK',
          negAnsMsg: '',
        })
        .subscribe((result) => {
          console.log('Dialog closed with:', result);
        });

      console.log('>===>>>', msg);
    });
  }

  ngAfterViewInit() {
    // Capture and react to user selection changes
    this.categoryChangesSubscription = this.linkScrapeForm.controls[
      'selectCategory'
    ].valueChanges.subscribe((keys: string[]) => {
      // console.log('>===>> SingleUrl - ngAfterViewInit() - selected keys changed:', keys);
      this.selectedCategoryIds = keys
        .map((key) => parseInt(key, 10))
        .filter((id) => !isNaN(id));
      console.log(
        '>===>> SingleUrl - ngAfterViewInit() - selectedCategoryIds:',
        this.selectedCategoryIds
      );
    });
  }
  ngOnDestroy() {
    this.categoryChangesSubscription?.unsubscribe();
  }

  setupForm() {
    this.linkScrapeForm = this.fb.group({
      url: this.fb.control('', [Validators.required]),
      maxArticles: this.fb.control(LIST_MAX_ARTICLES_DEFAULT, [Validators.required, Validators.min(1)]),
      chunkSize: this.fb.control(this.listChunkSizeDefault, [Validators.required, Validators.min(1)]),
      autoExcludeExisting: this.fb.control(true),
      add: this.fb.control(true),
      selectCategory: this.fb.control<string[]>([]),
    });
  }

  private async loadListScrapeConfig(): Promise<void> {
    const cfg = await this.articlebasicscraper.getListScrapeConfig();
    if (cfg.success && typeof cfg.chunkSizeDefault === 'number' && cfg.chunkSizeDefault > 0) {
      this.listChunkSizeDefault = cfg.chunkSizeDefault;
      this.linkScrapeForm.get('chunkSize')?.setValue(cfg.chunkSizeDefault, { emitEvent: false });
    }
  }

  async submitForm(): Promise<void> {
    if (this.linkScrapeForm.valid) {
      // console.log('submit', this.validateForm.value);
      const urlValue = this.linkScrapeForm.value.url;
      const rememberValue = this.linkScrapeForm.value.remember;
      console.log('Submitted URL: ', urlValue);

      if (this.selectedCategoryIds.length === 0) {
        const confirmed = await firstValueFrom(
          this.dlgService.popup({
            token: 'conf',
            header: 'No Category(-ies) Selected',
            content: 'Do you want to continue without selecting a category?',
            posAnsMsg: 'Yes',
            negAnsMsg: 'No',
            initialFocus: 1,
          })
        );
        if (!confirmed) return; // User chose 'No', so exit
      }

      const maxArticles = this.linkScrapeForm.value.maxArticles ?? LIST_MAX_ARTICLES_DEFAULT;
      const chunkSize = this.linkScrapeForm.value.chunkSize ?? this.listChunkSizeDefault;
      this.runScraper(urlValue, maxArticles, chunkSize);
      // void this.loader.withLoader(
      //   () =>  this.runScraper(urlValue),
      //   'Scraping List articles data ...'
      // );
      // this.isSaveButtonEnabled.set(false);
    } else {
      Object.values(this.linkScrapeForm.controls).forEach((control) => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }

  async runScraper(
    url: string,
    maxArticles = LIST_MAX_ARTICLES_DEFAULT,
    chunkSize = this.listChunkSizeDefault
  ): Promise<void> {
    let loading = true;
    let result = null;
    let shouldStartFullScrape = false;
    let chunkedModeReceived = false;
    this.scrappedError.set('');

    // ── Per-chunk IPC handler (chunked mode only) ──────────────────────────────
    // Registered before the invoke. Electron sends 'scrape-list-chunk-ready' with
    // each chunk's metadata, then waits for 'scrape-list-chunk-confirm' before
    // proceeding to article removal and the next chunk.
    const chunkHandler = (data: { posts: PostData[]; chunkIndex: number }) => {
      void (async () => {
        let chunkDecision: { removeFromList: boolean; linksToRemove: string[] } = {
          removeFromList: false,
          linksToRemove: [],
        };
        let postsToScrapeAndPersist: PostData[] = [];
        const linksToRemoveSet = new Set<string>();

        try {
          chunkedModeReceived = true;
          const incoming = (data.posts ?? []) as PostData[];
          const chunkIndex = data.chunkIndex ?? 1;

          // 1. Accumulate into signals (replace on chunk 1, append on subsequent)
          const current = chunkIndex === 1 ? [] : this.$scrappedDataArray();
          const accumulated = this.dedupePostsBySlug([...current, ...incoming]);
          this.setScrappedPosts(accumulated);
          this.precheckSummary.set(this.buildPrecheckSummaryForPosts(accumulated));

          // 2. DB analysis for this chunk only
          const analysis = await this.articlesmultiscraper.analyzeScrapedPostsAgainstDb(incoming);
          postsToScrapeAndPersist = incoming;
          const autoExcludeExisting = this.linkScrapeForm.value.autoExcludeExisting !== false;

          if (analysis.summary.existingSlugCount > 0) {
            if (autoExcludeExisting) {
              const slugsToRemove = new Set<string>(
                analysis.matchingPosts
                  .map((p) => getMediumSlugFromUrl(p.link))
                  .filter((s): s is string => !!s)
              );
              const existingLinksToRemove = analysis.matchingPosts
                .map((p) => p.link)
                .filter((link): link is string => !!link);
              existingLinksToRemove.forEach((link) => linksToRemoveSet.add(link));

              const filtered = this.$scrappedDataArray().filter(
                (p) => !slugsToRemove.has(getMediumSlugFromUrl(p.link) ?? '')
              );
              this.setScrappedPosts(filtered);
              this.precheckSummary.set(this.buildPrecheckSummaryForPosts(filtered));
              postsToScrapeAndPersist = analysis.remainingPosts;
            } else {
              // 3. Confirmation dialog for already-existing DB rows in this chunk.
              const confirmed = await firstValueFrom(
                this.dlgService.popup({
                  token: 'conf',
                  header: `Chunk ${chunkIndex} – Articles Already In DB`,
                  content:
                    `Chunk articles: ${incoming.length}\n` +
                    `Already stored in DB: ${analysis.summary.existingSlugCount}\n` +
                    `Remaining after removal: ${analysis.remainingPosts.length}\n\n` +
                    `Remove the already-stored articles from this chunk before scraping?`,
                  posAnsMsg: 'Remove Existing',
                  negAnsMsg: 'Keep All',
                  initialFocus: 1,
                })
              );

              if (confirmed) {
                const slugsToRemove = new Set<string>(
                  analysis.matchingPosts
                    .map((p) => getMediumSlugFromUrl(p.link))
                    .filter((s): s is string => !!s)
                );
                const existingLinksToRemove = analysis.matchingPosts
                  .map((p) => p.link)
                  .filter((link): link is string => !!link);
                existingLinksToRemove.forEach((link) => linksToRemoveSet.add(link));

                const filtered = this.$scrappedDataArray().filter(
                  (p) => !slugsToRemove.has(getMediumSlugFromUrl(p.link) ?? '')
                );
                this.setScrappedPosts(filtered);
                this.precheckSummary.set(this.buildPrecheckSummaryForPosts(filtered));
                postsToScrapeAndPersist = analysis.remainingPosts;
              }
            }
          }

          // 4. Scrape and persist remaining chunk posts BEFORE unblocking Electron.
          if (postsToScrapeAndPersist.length > 0) {
            await this.fullArticleScrapeFromPosts(postsToScrapeAndPersist, {
              showCompletionPopup: false,
              updateSignals: false,
            });

            // 5. After persist, these processed links are now DB-existing,
            // so remove them from Medium list before loading next chunk.
            postsToScrapeAndPersist
              .map((p) => p.link)
              .filter((link): link is string => !!link)
              .forEach((link) => linksToRemoveSet.add(link));
          }

          if (linksToRemoveSet.size > 0) {
            chunkDecision = {
              removeFromList: true,
              linksToRemove: Array.from(linksToRemoveSet),
            };
          }
        } catch (err) {
          console.error('scrape-list-chunk-ready handler error:', err);
        } finally {
          // Always unblock Electron so the next chunk / removal can proceed
          window.electronAPI.send('scrape-list-chunk-confirm', chunkDecision);
        }
      })();
    };

    window.electronAPI.on('scrape-list-chunk-ready', chunkHandler);

    try {
      // Call the appropriate service method: scrapeArticle() or scrapeList()
      if (this.listurldata.listname.trim().length <= 0) {
        this.dlgService
          .popup({
            token: 'info',
            header: 'The link is not a valid List URL',
            content:
              'For multiple article URLs, try "File URLs".\n' +
              'For simple article URLs, try "Single URL".',
            posAnsMsg: 'OK',
            negAnsMsg: '',
          })
          .subscribe((res) => console.log('Dialog closed with:', res));
        return;
      }
      const response = await this.articlebasicscraper.scrapeList(url, maxArticles, chunkSize);
      if (response.success) {
        // Update declared total signal and pre-fill the input for the next run
        const dt = response.declaredTotal ?? null;
        this.$declaredTotal.set(dt);
        if (dt !== null && dt < this.linkScrapeForm.value.maxArticles) {
          this.linkScrapeForm.get('maxArticles')?.setValue(dt, { emitEvent: false });
        }
        if (chunkedModeReceived) {
          // Chunked mode: full scrape/persist already happened per chunk;
          // skip final full-article scrape pass.
          const accumulated = this.$scrappedDataArray();
          if (accumulated.length === 0) {
            this.dlgService
              .popup({
                token: 'info',
                header: 'Nothing Left To Scrape',
                content:
                  'All loaded list articles are already stored in the DB. The article-by-article scraping process will not start.',
                posAnsMsg: 'OK',
                negAnsMsg: '',
              })
              .subscribe((res) => console.log('Dialog closed with:', res));
            return;
          }
          result = accumulated;
          shouldStartFullScrape = false;
        } else {
          // Non-chunked mode: original single-pass flow.
          const listPosts = Array.isArray(response.data)
            ? this.dedupePostsBySlug(response.data as PostData[])
            : [];

          if (listPosts.length === 0) {
            this.dlgService
              .popup({
                token: 'warn',
                header: 'No Articles Found',
                content: 'No article URLs were found in the provided Medium list.',
                posAnsMsg: 'OK',
                negAnsMsg: '',
              })
              .subscribe((res) => console.log('Dialog closed with:', res));
            return;
          }

          this.setScrappedPosts(listPosts);
          result = listPosts;
          shouldStartFullScrape = await this.precheckLoadedListPosts();
        }
      } else {
        result = response.error;
      }
      // }
      // 250914 - Commented out because our intention is this component to deal only with Lists
      // else {
      //   const response = await this.articlebasicscraper.scrapeArticle(url);
      //   if (response.success) {
      //     this.scrappedData.set(response.data as PostData); // Store the result as PostData
      //     result = response.data;
      //     const currentData = this.scrappedData();
      //     if (currentData !== null) {
      //       if (!this.isAddedChecked()) {
      //         this.$scrappedDataArray.set([]); // Clear the array if 'add' is not checked
      //       }
      //       this.$scrappedDataArray.set([
      //         ...this.$scrappedDataArray(),
      //         currentData,
      //       ]); // Update the array with the new result
      //     }
      //   } else {
      //     if (response.error) this.scrappedError.set(response.error);
      //   }
      // }

      /** 250903
       *  * Continue with articles full scraping
       */
      if (shouldStartFullScrape) {
        await this.fullArticleScrapeFromMetaData();
      }
    } catch (err) {
      // result = { error: err };
      if (err) this.scrappedError.set(JSON.stringify({ err }));
    } finally {
      loading = false;
      window.electronAPI.removeAllListeners('scrape-list-chunk-ready');
    }

    if (result) {
      console.log('Scraper data:', JSON.stringify(result));
      this.$scrappedDataArrayString.set(
        JSON.stringify(this.$scrappedDataArray(), null, 2)
      ); // Beutify the JSON data;
    }
    if (this.scrappedError().trim().length > 0)
      console.log('Error Scraping data: ', this.scrappedError());
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault(); // Allow drop
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();

    const data =
      event.dataTransfer?.getData('text/uri-list') ||
      event.dataTransfer?.getData('text/plain');

    if (data) {
      const urlControl = this.linkScrapeForm.get('url');
      if (urlControl) {
        urlControl.setValue(''); // Clear existing value
        urlControl.setValue(data.trim()); // Set new dragged value
        // this.scrappedData.set(null);        // Clear scrapped data
        this.$scrappedDataArrayString.set(''); // Clear the string representation of the array
      }
    }
  }

  onClearScrappedData() {
    this.$scrappedDataArray.set([]); // Clear the array
    this.$scrappedDataArrayString.set(''); // Clear the string representation of the array
    this.scrappedData.set(null); // Clear the scrapped data
    this.precheckSummary.set(null);
    this.$declaredTotalLoading.set(false);
    this.$declaredTotal.set(null);
    this.linkScrapeForm.reset(); // Reset the form
    this.linkScrapeForm.get('add')?.setValue(true, { emitEvent: false });
    this.linkScrapeForm.get('autoExcludeExisting')?.setValue(true, { emitEvent: false });
    this.linkScrapeForm.get('maxArticles')?.setValue(LIST_MAX_ARTICLES_DEFAULT, { emitEvent: false });
    this.linkScrapeForm.get('chunkSize')?.setValue(this.listChunkSizeDefault, { emitEvent: false });
  }

  onCopyScrappedData() {
    const scrappedDataString = this.$scrappedDataArrayString();
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

  onSaveScrappedData() {
    if (this.$scrappedDataArray().length > 0) {
      this.runSaveScappedData();
    }
  }

  async runSaveScappedData() {
    // console.log('------> List Name: ', listurldata.listname);
    // console.log('------> Author Name: ', listurldata.pubauthorslug);

    try {
      if (this.listurldata.listname.trim().length > 0) {
        const result = await window.electronAPI.invoke(
          'save-scrapped-data',
          this.$scrappedDataArrayString(),
          this.listurldata
        );
      } else {
        const result = await window.electronAPI.invoke(
          'save-scrapped-data',
          this.$scrappedDataArrayString()
        );
      }
    } catch (error) {
      console.error('Error saving scrapped data:', error);
    }
  }

  // 250913
  private async fullArticleScrapeFromMetaData() {
    await this.fullArticleScrapeFromPosts(this.$scrappedDataArray(), {
      showCompletionPopup: true,
      updateSignals: true,
    });
  }

  private async fullArticleScrapeFromPosts(
    basePosts: PostData[],
    opts: { showCompletionPopup: boolean; updateSignals: boolean }
  ): Promise<void> {
    console.log(
      '>===>> ListUrls - fullArticleScrapeFromMetaData() - Started ...'
    );

    if (opts.updateSignals) {
      this.$scrappedDataArrayString.set('');
    }

    const urlsArray: string[] = basePosts.map(
      (item) => item.link
    );
    if (urlsArray.length === 0) {
      return;
    }

    try {
      const scrapeOptions = this.contentScrapePolicy.buildScrapeTabsOptions(urlsArray);
      const response = await this.articlebasicscraper.scrapeTabsList(
        urlsArray,
        scrapeOptions
      );
      if (response.success) {
        if (!response.data || response.data.length < 0) return;
        let result: PostData[] = []; // default
        if (Array.isArray(response.data) && response.data.length > 0) {
          result = response.data as PostData[];
        }
        console.log(
          '>===>> ListUrls - fullArticleScrapeFromMetaData() - Articles scraped: ',
          result.length,
          '  - Scrapped Data Array: ',
          JSON.stringify(result, null, 2)
        );

        // this.$scrappedDataArrayString.set(
        //   JSON.stringify(result, null, 2)
        // );

        const mergedPosts = this.mergeScrapedDataIntoPosts(basePosts, result);

        if (opts.updateSignals) {
          this.setScrappedPosts(mergedPosts);
        }

        // Insert scraped articles into the database, process/update article images and set/insert article categories
        // this.insertScrapedArticlesArrayToDB(this.$scrappedDataArray());   // 260325

        // 260325 - We moved the call to insertScrapedArticlesArrayToDB() inside the onGetFileUrls() function because we want to give the user the chance to review the scraped data and select a category before inserting into the DB. So, we will call insertScrapedArticlesArrayToDB() after the user clicks the "Get File URLs" button and after we get the file content from Electron.
        const persistSummary = await this.articlesmultiscraper.persistScrapedArticlesWithDedup(
          mergedPosts,
          this.selectedCategoryIds,
          this.getPersistModeFromToggle()
        );

        if (opts.showCompletionPopup) {
          this.dlgService
            .popup({
              token: 'info',
              header: 'List Scraping Completed',
              content:
                `Inserted new articles: ${persistSummary.insertedCount}\n` +
                `Updated existing articles: ${persistSummary.updatedCount}\n` +
                `Skipped unchanged/newer DB articles: ${persistSummary.skippedCount}`,
              posAnsMsg: 'OK',
              negAnsMsg: '',
            })
            .subscribe((res) => console.log('Dialog closed with:', res));
        }


      }
    } catch (error) {
      console.error('Error scraping article data:', error);
    }
  }

  // 250913
  private mergeScrapedDataIntoPosts(basePosts: PostData[], fullScrapedData: PostData[]): PostData[] {
    const merged = [...basePosts];

    const excludedLinks = new Set(
      fullScrapedData
        .filter((item) => item.excludeFromPersistence)
        .map((item) => item.link)
    );

    const filteredMerged =
      excludedLinks.size > 0
        ? merged.filter((item) => !excludedLinks.has(item.link))
        : merged;

    for (const newData of fullScrapedData) {
      if (newData.excludeFromPersistence) {
        continue;
      }

      const match = filteredMerged.find(
        (item) =>
          getMediumSlugFromUrl(item.link) === getMediumSlugFromUrl(newData.link)
      );

      if (match && newData.content) {
        match.content = newData.content;
        match.link = newData.link;
      }
    }

    return filteredMerged;
  }

  // 250913
  private updateScrappedDataArray(fullScrapedData: PostData[]) {
    console.log('>===>> ListUrls - updateScrappedDataArray() - Started ...');
    const merged = this.mergeScrapedDataIntoPosts(this.$scrappedDataArray(), fullScrapedData);
    this.$scrappedDataArray.set([...merged]);
    this.$scrappedDataArrayString.set(
      JSON.stringify(this.$scrappedDataArray(), null, 2)
    );
  }

  private setScrappedPosts(posts: PostData[]): void {
    this.$scrappedDataArray.set([...posts]);
    this.$scrappedDataArrayString.set(JSON.stringify(posts, null, 2));
  }

  private buildPrecheckSummaryForPosts(posts: PostData[]): MultiScrapePrecheckSummary {
    const normalizedUrls = (posts ?? [])
      .map((post) => (post?.link ?? '').trim())
      .filter((url) => url.length > 0);
    const uniqueUrls = Array.from(new Set(normalizedUrls));

    return {
      totalUrls: normalizedUrls.length,
      uniqueUrls,
      duplicateUrlCount: normalizedUrls.length - uniqueUrls.length,
      newCount: uniqueUrls.length,
      existingSlugCount: 0,
    };
  }

  private async precheckLoadedListPosts(): Promise<boolean> {
    const analysis = await this.articlesmultiscraper.analyzeScrapedPostsAgainstDb(
      this.$scrappedDataArray()
    );
    this.precheckSummary.set(analysis.summary);

    if (analysis.summary.existingSlugCount <= 0) {
      this.dlgService
        .popup({
          token: 'info',
          header: 'List Articles Summary',
          content:
            `List articles found: ${analysis.summary.totalUrls}\n` +
            `Unique URLs: ${analysis.summary.uniqueUrls.length}\n` +
            `New articles to insert: ${analysis.summary.newCount}\n` +
            `Existing same-slug articles: ${analysis.summary.existingSlugCount}` +
            (analysis.summary.duplicateUrlCount > 0
              ? `\nDuplicate URLs in list: ${analysis.summary.duplicateUrlCount}`
              : ''),
          posAnsMsg: 'OK',
          negAnsMsg: '',
        })
        .subscribe((res) => console.log('Dialog closed with:', res));

      return true;
    }

    const confirmed = await firstValueFrom(
      this.dlgService.popup({
        token: 'conf',
        header: 'Existing Articles Already In DB',
        content:
          `List articles found: ${analysis.summary.totalUrls}\n` +
          `Unique URLs: ${analysis.summary.uniqueUrls.length}\n` +
          `Already stored in DB: ${analysis.summary.existingSlugCount}\n` +
          `Remaining after removal: ${analysis.remainingPosts.length}` +
          (analysis.summary.duplicateUrlCount > 0
            ? `\nDuplicate URLs in list: ${analysis.summary.duplicateUrlCount}`
            : '') +
          `\n\nDo you want to remove the already stored articles before the article-by-article scraping starts?`,
        posAnsMsg: 'Remove Existing',
        negAnsMsg: 'Keep All',
        initialFocus: 1,
      })
    );

    if (!confirmed) {
      return true;
    }

    this.setScrappedPosts(analysis.remainingPosts);
    this.precheckSummary.set(this.buildPrecheckSummaryForPosts(analysis.remainingPosts));

    if (analysis.remainingPosts.length === 0) {
      this.dlgService
        .popup({
          token: 'info',
          header: 'Nothing Left To Scrape',
          content:
            'All loaded list articles are already stored in the DB. The article-by-article scraping process will not start.',
          posAnsMsg: 'OK',
          negAnsMsg: '',
        })
        .subscribe((res) => console.log('Dialog closed with:', res));

      return false;
    }

    return true;
  }

  private dedupePostsBySlug(posts: PostData[]): PostData[] {
    const bySlug = new Map<string, PostData>();

    for (const post of posts) {
      const slug = getMediumSlugFromUrl(post.link);
      if (!slug) {
        bySlug.set(`${post.link}-${bySlug.size}`, post);
        continue;
      }

      if (!bySlug.has(slug)) {
        bySlug.set(slug, post);
      }
    }

    return Array.from(bySlug.values());
  }

  private getPersistModeFromToggle(): MultiScrapePersistMode {
    const checked = !!this.linkScrapeForm.get('add')?.value;
    return checked ? 'dbSync' : 'insertOnlyNew';
  }

  // 260325
  // Both functions insertScrapedArticlesArrayToDB() and processMarkdownContentImages() that are related 
  // to the processing of multiple articles, were moved to the Articlesmultiscraper service. 
  // So, their logic relies in 1 shared place and can be used also from other components.
  // async insertScrapedArticlesArrayToDB(dataArray: PostData[]) { . . .
  // async processMarkdownContentImages(articles: PostData[]) { . . .
  




  // 251013


  // Category search functionality methods
  clearCategorySearch(): void {
    this.$categorySearchText.set('');
    this.clearTreeHighlights();
  }

  onCategorySearchChange(value: string): void {
    this.$categorySearchText.set(value);
    
    // Open tree select when user types something
    if (value.trim().length > 0 && this.catSel && !this.catSel.nzOpen) {
      setTimeout(() => {
        if (this.catSel && !this.catSel.nzOpen) {
          this.catSel.openDropdown();
          // The highlighting will be applied by onTreeOpenChange
        }
      }, 100);
    } else if (value.trim().length > 0 && this.catSel && this.catSel.nzOpen) {
      // Tree is already open, apply highlighting directly
      this.highlightTreeNodes(value);
    } else if (value.trim().length === 0) {
      // Clear highlighting when search is empty
      this.clearTreeHighlights();
    }
  }

  // Handle search input focus
  onSearchInputFocus(): void {
    // If there's search text and dropdown is closed, open it
    const searchText = this.$categorySearchText();
    if (searchText && searchText.trim().length > 0 && this.catSel && !this.catSel.nzOpen) {
      setTimeout(() => {
        if (this.catSel && !this.catSel.nzOpen) {
          this.catSel.openDropdown();
        }
      }, 100);
    }
  }

  // Handle tree open/close events
  onTreeOpenChange(isOpen: boolean): void {
    console.log('Tree open state changed:', isOpen);
    
    if (isOpen) {
      // Apply highlighting when tree opens - only once
      const searchText = this.$categorySearchText();
      if (searchText) {
        console.log('Tree opened - applying highlighting for:', searchText);
        setTimeout(() => this.highlightTreeNodes(searchText), 200);
      }
      
      // Return focus to search input
      setTimeout(() => {
        if (this.searchInput) {
          this.searchInput.nativeElement.focus();
        }
      }, 300);
    } else {
      // Clear highlights when tree closes
      this.clearTreeHighlights();
    }
  }

  // Method to manually open tree select 
  openTreeSelect(): void {
    if (this.catSel) {
      this.catSel.openDropdown();
    }
  }

  // Set expanded state for nodes that match search or have matching children
  private setExpandedNodesForSearch(nodes: NzTreeNodeOptions[], searchTerm: string): NzTreeNodeOptions[] {
    return nodes.map(node => {
      const nodeMatches = node.title?.toString().toLowerCase().includes(searchTerm);
      const hasMatchingChildren = node.children ? this.hasMatchingDescendants(node.children, searchTerm) : false;
      
      return {
        ...node,
        expanded: nodeMatches || hasMatchingChildren,
        children: node.children ? this.setExpandedNodesForSearch(node.children, searchTerm) : undefined
      };
    });
  }

  private hasMatchingDescendants(nodes: NzTreeNodeOptions[], searchTerm: string): boolean {
    return nodes.some(node => {
      const nodeMatches = node.title?.toString().toLowerCase().includes(searchTerm);
      const childrenMatch = node.children ? this.hasMatchingDescendants(node.children, searchTerm) : false;
      return nodeMatches || childrenMatch;
    });
  }




  // Count total matches in the tree
  private countMatches(nodes: NzTreeNodeOptions[], searchTerm: string): number {
    let count = 0;
    for (const node of nodes) {
      // Check if current node matches
      if (node.title?.toString().toLowerCase().includes(searchTerm)) {
        count++;
      }
      // Recursively count matches in children
      if (node.children) {
        count += this.countMatches(node.children, searchTerm);
      }
    }
    return count;
  }

  // More robust highlighting that works with NG-ZORRO tree structure
  private highlightTreeNodes(searchText: string): void {
    if (!searchText) {
      this.clearTreeHighlights();
      return;
    }
    
    console.log('=== HIGHLIGHTING DEBUG ===');
    console.log('Search text:', searchText);
    
    // Clear existing highlights
    this.clearTreeHighlights();
    
    // Wait for tree to render, then apply highlighting with multiple selectors
    setTimeout(() => {
      // Try multiple possible selectors for NG-ZORRO tree
      const possibleSelectors = [
        '.ant-tree-select-dropdown',
        '.ant-select-dropdown',
        '.ant-tree-dropdown', 
        '[class*="tree-select"]',
        '[class*="dropdown"]'
      ];
      
      let treeDropdown = null;
      for (const selector of possibleSelectors) {
        treeDropdown = document.querySelector(selector);
        if (treeDropdown) {
          console.log('Found dropdown with selector:', selector);
          break;
        }
      }
      
      if (!treeDropdown) {
        console.log('❌ No tree dropdown found with any selector');
        // Print all elements that might be the dropdown
        const allDropdowns = document.querySelectorAll('[class*="dropdown"], [class*="tree"], [class*="select"]');
        console.log('Available elements:', Array.from(allDropdowns).map(el => el.className));
        return;
      }

      // Try multiple selectors for tree nodes
      const nodeSelectors = [
        '.ant-tree-title',
        '.ant-tree-node-content-wrapper',
        '[class*="tree-title"]',
        '[class*="tree-node"]',
        '[title]'
      ];
      
      let treeNodes: NodeListOf<Element> | null = null;
      for (const selector of nodeSelectors) {
        const foundNodes = treeDropdown.querySelectorAll(selector);
        if (foundNodes.length > 0) {
          treeNodes = foundNodes;
          console.log('Found', foundNodes.length, 'nodes with selector:', selector);
          break;
        }
      }
      
      if (!treeNodes || treeNodes.length === 0) {
        console.log('❌ No tree nodes found');
        console.log('Dropdown HTML:', treeDropdown.innerHTML.substring(0, 500));
        return;
      }
      
      let highlightedCount = 0;
      const searchLower = searchText.toLowerCase();
      
      Array.from(treeNodes).forEach((node: Element, index: number) => {
        // Try to get text content from various possible locations
        let text = '';
        let titleElement: Element | null = null;
        let wrapperElement: Element | null = null;
        
        if (node.classList.contains('ant-tree-title')) {
          // Current node is the title, find its wrapper parent AND the row container
          titleElement = node;
          text = node.textContent?.toLowerCase() || '';
          
          // First find the title wrapper (nz-tree-node-title)
          wrapperElement = node.closest('nz-tree-node-title') || 
                          node.closest('.ant-select-tree-node-content-wrapper');
          
          // Then find the actual row container (nz-tree-node) for background highlighting
          const rowElement = node.closest('nz-tree-node') || 
                           node.closest('[class*="tree-treenode"]');
          
          // If we found the row element, use it for background; otherwise fall back to wrapper
          if (rowElement) {
            wrapperElement = rowElement;
          }
          
          // If still no wrapper found, try other possible parent elements
          if (!wrapperElement) {
            wrapperElement = node.closest('[class*="tree-node"]') || 
                            node.closest('[class*="content-wrapper"]') ||
                            node.parentElement;
          }
        } else if (node.classList.contains('ant-tree-node-content-wrapper')) {
          // Current node is the wrapper, find its title child
          wrapperElement = node;
          titleElement = node.querySelector('.ant-tree-title') || node;
          text = titleElement.textContent?.toLowerCase() || '';
        } else {
          // Fallback: treat current node as title and find wrapper
          titleElement = node;
          text = node.textContent?.toLowerCase() || '';
          wrapperElement = node.closest('.ant-tree-node-content-wrapper') || 
                          node.closest('[class*="tree-node"]') || 
                          node.parentElement;
        }
        
        console.log(`Node ${index}: "${text.substring(0, 30)}..." matches: ${text.includes(searchLower)}`);
        console.log(`  - Title element:`, titleElement?.tagName, titleElement?.className);
        console.log(`  - Wrapper element:`, wrapperElement?.tagName, wrapperElement?.className);
        
        if (text.includes(searchLower) && wrapperElement) {
          // Apply highlighting to the wrapper element (for background)
          wrapperElement.setAttribute('data-highlighted', 'true');
          wrapperElement.classList.add('search-highlighted');
          
          const wrapperHtml = wrapperElement as HTMLElement;
          wrapperHtml.style.backgroundColor = 'rgba(255, 242, 232, 0.8)';
          wrapperHtml.style.borderLeft = '4px solid #fa8c16';
          wrapperHtml.style.borderRadius = '4px';
          
          // Apply text styling to the title element
          if (titleElement) {
            const titleHtml = titleElement as HTMLElement;
            titleHtml.style.color = '#fa8c16';
            titleHtml.style.fontWeight = '600';
          }
          
          highlightedCount++;
          console.log('✅ Highlighted node:', text.substring(0, 50));
          console.log(`  - Applied data-highlighted to:`, wrapperElement.tagName, wrapperElement.className);
        }
      });
      
      console.log('Total highlighted:', highlightedCount, 'out of', treeNodes?.length || 0);
      console.log('=== END HIGHLIGHTING DEBUG ===');
      
    }, 250); // Longer delay to ensure tree is fully rendered
  }

  private clearTreeHighlights(): void {
    console.log('Clearing highlights...');
    
    // Remove style elements
    const existingStyle = document.getElementById('tree-search-highlight-style');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Remove data attributes and inline styles
    const highlightedNodes = document.querySelectorAll('[data-highlighted="true"], .search-highlighted');
    Array.from(highlightedNodes).forEach(node => {
      node.removeAttribute('data-highlighted');
      node.classList.remove('search-highlighted');
      
      // Remove inline styles
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
    
    console.log('Cleared', highlightedNodes.length, 'highlighted nodes');
  }








}
