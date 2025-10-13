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

import { DlgService } from '../shared/services/dlg-service';

import {
  NzTreeSelectComponent,
  NzTreeSelectModule,
} from 'ng-zorro-antd/tree-select';
import { CategoryNodes } from '../shared/services/category-nodes';
import { NzTreeNodeOptions } from 'ng-zorro-antd/tree';
import { BackEnd } from '../shared/services/back-end';
import { firstValueFrom, Subscription } from 'rxjs';
import { LoaderService } from '../shared/services/loader-service';
import { NzIconModule } from 'ng-zorro-antd/icon';

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
  // public scrappedData = "";
  public scrappedError = signal<string>('');
  public scrappedData = signal<PostData | null>(null);
  public $scrappedDataArray = signal<PostData[]>([]);
  public $scrappedDataArrayString = signal<string>('');
  // public isSaveButtonEnabled = signal<boolean>(false);
  public isAddedChecked = signal<boolean>(true); // Default to true
  public linkURL = signal<string>('');
  private listurldata: listURLData = { listname: '', pubauthorslug: '' };

  // private modal = inject(NzModalService);
  private dlgService = inject(DlgService);

  private backendService = inject(BackEnd);
  private categoryNodesService = inject(CategoryNodes);
  public $categoryNodes = signal<NzTreeNodeOptions[]>([]);
  private categoryChangesSubscription?: Subscription;
 
  public selectedCategoryIds: number[] = [];
  private loader = inject(LoaderService);


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

    if (this.categoryNodesService.$catTreeNodes().length === 0) {
      this.categoryNodesService.setCategoryTreeNodesSignal();
    }
    console.log(
      '>===>> Category tree nodes: ',
      this.categoryNodesService.$catTreeNodes().length
    );

    this.linkScrapeForm.get('add')?.valueChanges.subscribe((value) => {
      console.log('Checkbox changed to:', value);
      this.isAddedChecked.set(value); // Update the signal when checkbox changes
    });
    this.linkScrapeForm.get('url')?.valueChanges.subscribe((urlValue) => {
      this.linkURL.set(urlValue);

      this.listurldata = { listname: '', pubauthorslug: '' };
      if (urlValue.trim().length > 0 && isValidUrl(urlValue.trim())) {
        console.log('URL changed to:', this.linkURL());
        this.listurldata = analyzeListedLink(urlValue);
        // console.log('List Name (if):', this.listurldata.listname.trim());
      }
      if (this.listurldata.listname.trim().length > 0) {
        this.linkScrapeForm.get('add')?.setValue(false);
      } else if (this.listurldata.listname.trim().length === 0) {
        this.linkScrapeForm.get('add')?.setValue(true);
      }
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
      add: this.fb.control(true),
      selectCategory: this.fb.control<string[]>([]),
    });
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

      this.runScraper(urlValue);
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

  async runScraper(url: string): Promise<void> {
    let loading = true;
    let result = null;
    this.scrappedError.set('');

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
      const response = await this.articlebasicscraper.scrapeList(url);
      if (response.success) {
        let postsArray: PostData[] = [];
        if (!this.isAddedChecked() && response.data.length > 0)
          postsArray = await this.removeExistingArticles(response.data);
        if (postsArray.length === 0) {
          this.dlgService
            .popup({
              token: 'warn',
              header: 'No Articles to Add',
              content:
                'All articles in the List are already present in the database.',
              posAnsMsg: 'OK',
              negAnsMsg: '',
            })
            .subscribe((res) => console.log('Dialog closed with:', res));
          return;
        } else if (
          postsArray.length > 0 &&
          postsArray.length < response.data.length
        ) {
          console.log(
            '>===>> ListUrls - runScraper() - Articles remaining for scraping after removing existing:',
            postsArray
          );
          this.dlgService
            .popup({
              token: 'warn',
              header: 'Articles in the List for scraping',
              content:
                'Some articles in the List are already present in the database. Articles remaining for scraping: ' +
                postsArray.length,
              posAnsMsg: 'OK',
              negAnsMsg: '',
            })
            .subscribe((res) => console.log('Dialog closed with:', res));
        }
        // return;    // <------------
        // this.$scrappedDataArray.set(response.data as PostData[]); // Store the result as PostData[]
        // result = response.data;
        this.$scrappedDataArray.set(postsArray as PostData[]); // Store the result as PostData[]
        result = postsArray;
        this.$scrappedDataArrayString.set(
          JSON.stringify(this.$scrappedDataArray(), null, 2)
        ); // Beutify the JSON data;
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
      this.fullArticleScrapeFromMetaData();
    } catch (err) {
      // result = { error: err };
      if (err) this.scrappedError.set(JSON.stringify({ err }));
    } finally {
      loading = false;
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
    this.linkScrapeForm.reset(); // Reset the form
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

  // 250914
  // Do not mutate an array while iterating with a for...of loop and manually adjusting the index i.
  // Instead, of mutating the array while iterating, build a new array with only the articles that do not exist in the database.
  async removeExistingArticles(postDataArray: PostData[]): Promise<PostData[]> {
    if (!postDataArray || postDataArray.length === 0) return [];
    const result: PostData[] = [];
    for (const post of postDataArray) {
      const postSlug: string | undefined = getMediumSlugFromUrl(post.link);
      if (postSlug && !(await this.backendService.checkSlugExists(postSlug))) {
        result.push(post);
      } else {
        console.log(
          '>===>> ListUrls - removeExistingArticles() - Article already exists, removing from array:',
          postSlug
        );
      }
    }
    return result;
  }

  // 250913
  private async fullArticleScrapeFromMetaData() {
    console.log(
      '>===>> ListUrls - fullArticleScrapeFromMetaData() - Started ...'
    );
    this.$scrappedDataArrayString.set('');

    const urlsArray: string[] = this.$scrappedDataArray().map(
      (item) => item.link
    );
    try {
      const response = await this.articlebasicscraper.scrapeTabsList(urlsArray);
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

        this.updateScrappedDataArray(result);
        // console.log('>===>> Scrapped Data Array: ', this.$scrappedDataArray());

        // Insert scraped articles into the database, process/update article images and set/insert article categories
        this.insertScrapedArticlesArrayToDB(this.$scrappedDataArray());
      }
    } catch (error) {
      console.error('Error scraping article data:', error);
    }
  }

  // 250913
  private updateScrappedDataArray(fullScrapedData: PostData[]) {
    console.log('>===>> ListUrls - updateScrappedDataArray() - Started ...');
    const currentArray = this.$scrappedDataArray();
    for (const newData of fullScrapedData) {
      console.log(
        '>===>> ListUrls - updateScrappedDataArray() - FullScrapedData Article: ',
        newData.link,
        ' Slug: ',
        getMediumSlugFromUrl(newData.link)
      );
      const match = currentArray.find(
        (item) =>
          getMediumSlugFromUrl(item.link) === getMediumSlugFromUrl(newData.link)
      );
      console.log(
        '>===>> ListUrls - updateScrappedDataArray() - Matched Article: ',
        match!.link,
        ' Slug: ',
        getMediumSlugFromUrl(match!.link)
      );
      if (match && newData.content) {
        match.content = newData.content;
        match.link = newData.link;
      }
    }
    this.$scrappedDataArray.set([...currentArray]);
    this.$scrappedDataArrayString.set(
      JSON.stringify(this.$scrappedDataArray(), null, 2)
    );
  }

  // 250913
  /**
   * Inserts the scraped data array into the main database.
   * Displays a dialog with the result of the insertion.
   * @param dataArray - The array of PostData to insert.
   */
  async insertScrapedArticlesArrayToDB(dataArray: PostData[]) {
    if (dataArray.length === 0) return;
    console.log(
      '>===>> ListUrls - insertScrapedArticlesArrayToDB() Started ... Inserting scraped articles to DB:',
      dataArray.length
    );
    try {
      // 1. Insert all full-scraped articles int articles table
      const insertedCount = await this.backendService.insertArticles(dataArray);

      if (insertedCount > 0) {
        // 2. Insert images for all articles in the dataArray
        // 250827
        // Insert images
        this.processMarkdownContentImages(dataArray); // Process images after insertion

        // 3. Set article categories for each full-scraped article iterating through the dataArray
        for (const article of dataArray) {
          const urlSlug = getMediumSlugFromUrl(article.link);
          // Process each article's content images
          const insertedArticleId = await this.backendService
            .getPostDataBySlug(urlSlug)
            .then((addedArticle) => addedArticle?.id);

          // 250902
          // Set article categories
          console.log(
            '>===>> Setting categories for article ID:',
            insertedArticleId,
            ' - Categories:',
            this.selectedCategoryIds
          );
          if (this.selectedCategoryIds.length > 0) {
            // this.setArticleCategories(dataArray[0].id!, this.selectedCategoryIds);
            this.backendService
              .updateArticleCategories(
                insertedArticleId!,
                this.selectedCategoryIds
              )
              .then((res) => {
                console.log(
                  '>===>> Article categories updated successfully?',
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
      } else {
        console.error('Unexpected result from DB insert:', insertedCount);
        this.dlgService
          .popup({
            token: 'error',
            header: 'Error',
            content: 'Failed to insert article(s) to the main DB.',
            posAnsMsg: 'OK',
            negAnsMsg: '',
          })
          .subscribe((res) => console.log('Dialog closed with:', res));
      }
    } catch (err) {
      console.error('Error inserting URLs to main DB:', err);
    }
  }

  // 250913
  // 250827
  // Process images in the markdown content
  // This function iterates over each article and processes its images
  //
  async processMarkdownContentImages(articles: PostData[]) {
    console.log('>===>> Starting processMarkdownContentImage() ...');
    for (const article of articles) {
      const urlSlug = getMediumSlugFromUrl(article.link);
      // Process each article's content images
      const articleData = await this.backendService.getPostDataBySlug(urlSlug);
      if (articleData && articleData.id && articleData.content) {
        // Process images in the markdown content
        const imageProcessingResult =
          await this.articlebasicscraper.processImagesForArticleMarkdownContent(
            articleData.id,
            articleData.link,
            articleData.content
          );
        if (imageProcessingResult) {
          // Update the article content in the database if it has changed
          for (const extracted of imageProcessingResult.extracted) {
            // Process each extracted image
            // extracted --> { orderIndx: number; imgUrl: string }
            console.log('>===>> Extracted image:', JSON.stringify(extracted));
          }
          for (const result of imageProcessingResult.results) {
            // Update the article content with the processed image
            // result --> { orgImgUrl: string; orderIndx?: number } & ImageDownloadResult
            // ImageDownloadResult --> {
            //   - success: true/false
            //   - aborted: true if the download was aborted (e.g., due to size limits)
            //   - reason: explanation for failure (if any)
            //   - imageId: ID of the inserted image (if successful)
            //   - inserted: true if a new record was inserted
            //   - mime_type: MIME type of the image (if available)
            //   - byte_length: size of the image in bytes (if available)
            //   - sha256_hex: SHA-256 hash of the image (if available)
            //   - file_name: original file name of the image (if available)
            // }
            console.log(
              '>===>> Image processing result:',
              JSON.stringify(result)
            );
          }

          // Update the article content in the database
          const updatedContent =
            await this.articlebasicscraper.rewriteMarkdownWithDbLinks(
              articleData.content,
              // [{ orderIndx: result.orderIndx!, imgUrl: result.orgImgUrl, imageId: result.imageId }]
              imageProcessingResult.results
            );
          if (updatedContent && updatedContent !== articleData.content) {
            // Only update if content has changed
            const updateResult =
              await this.backendService.updateArticleContentById(
                articleData.id,
                updatedContent
              );
            if (updateResult) {
              console.log(
                `>===>> Article ID ${articleData.id} content updated with processed image links.`
              );
              // this.markdownString.set(updatedContent); // Update the preview with new content
              // // console.log(
              // //   '>===>> Article Content (Updated markdownString): ',
              // //   this.markdownString()
              // // );
              // this.markdownPreview(updatedContent); // Refresh the preview
            } else {
              console.error(
                `Failed to update content for Article ID ${articleData.id}.`
              );
            }
          }
        }
      }
    }
  }





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
