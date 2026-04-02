// single-url.ts

import { afterNextRender, Component, effect, inject, signal, ViewChild, computed, ElementRef } from '@angular/core';
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
import { NzTreeSelectComponent, NzTreeSelectModule } from 'ng-zorro-antd/tree-select';
import { NzIconModule } from 'ng-zorro-antd/icon';

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

// import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BackEnd } from '../shared/services/back-end';
import { from, Subscription } from 'rxjs';
import { Markshow } from '../shared/services/markshow';
import { LoaderService } from '../shared/services/loader-service';
import { CategoryNodes } from '../shared/services/category-nodes';
import { NzTreeNode, NzTreeNodeOptions } from 'ng-zorro-antd/tree';
import { ContentScrapePolicy } from '../shared/services/content-scrape-policy';



@Component({
  selector: 'single-url',
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
  templateUrl: './single-url.html',
  styleUrl: './single-url.scss',
})
export class SingleUrl {
  private fb = inject(NonNullableFormBuilder);
  public scrappedDataArray = signal<PostData[]>([]);
  public postMetaDataString = signal<string>('');
  public linkScrapeForm!: FormGroup;

  // public scrappedData = "";
  public scrappedError = signal<string>('');

  public markdownString = signal<string>('');
  // public isSaveButtonEnabled = signal<boolean>(false);
  public isForcedChecked = signal<boolean>(true); // Default to true
  public linkURL = signal<string>('');
  private listurldata: listURLData = { listname: '', pubauthorslug: '' };

  // private modal = inject(NzModalService);
  private dlgService = inject(DlgService);
  // constructor(private dlgService: DlgService){  }

  // private modalRef = inject(NzModalRef);

  public preview: boolean = true;
  public safeHtmlContent = signal<SafeHtml | null>(null);
  // private sanitizer = inject(DomSanitizer);

  private markedService = inject(Markshow);
  private backendService = inject(BackEnd);
  private loader = inject(LoaderService);
  private articlebasicscraper = inject(Articlebasicscraper);
  private categoryNodesService = inject(CategoryNodes);
  private sanitizer = inject(DomSanitizer);
  private contentScrapePolicy = inject(ContentScrapePolicy);

  public isNewArticle: boolean = false; // Flag to indicate if it's a new article
  private existingArticleData: PostData | null = null;

  public $categoryNodes = signal<NzTreeNodeOptions[]>([]);
  
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

  public selectedCategoryIds: number[] = [];
  // selectedCategoryKey: string | null = null;
  private categoryChangesSubscription?: Subscription;
  @ViewChild('catSel', { static: false }) catSel!: NzTreeSelectComponent;
  @ViewChild('searchInput', { static: false }) searchInput!: ElementRef<HTMLInputElement>;
  
  constructor() {
    // Removed the effect that was causing endless loops
    // Highlighting will be triggered manually when needed
  }

  ngOnInit(): void {

    if (this.categoryNodesService.$catTreeNodes().length === 0) {
      this.categoryNodesService.setCategoryTreeNodesSignal();
    }
    
    this.setupForm();
    this.linkScrapeForm.get('force')?.valueChanges.subscribe((value) => {
      console.log('Checkbox changed to:', value);
      this.isForcedChecked.set(value); // Update the signal when checkbox changes
    });
    this.linkScrapeForm.get('url')?.valueChanges.subscribe((urlValue) => {
      if (urlValue.trim().length === 0 || !isValidUrl(urlValue.trim())) return;

      // this.loader.show(); // Show the loader when URL changes

      console.log('>===>> URL changed to:', urlValue);

      this.listurldata = { listname: '', pubauthorslug: '' };
      this.listurldata = analyzeListedLink(urlValue);

      // console.log('>===>> Analyzed List URL Data:', this.listurldata);
      // return;

      // Get the clean URL without the query parameters part
      const fullUrl = new URL(urlValue.trim());
      const clearUrl = fullUrl.origin + fullUrl.pathname;
      this.linkURL.set(clearUrl);

      console.log('>===>> Cleaned URL:', this.linkURL());

      // console.log('URL changed to:', this.linkURL());
      this.markdownString.set(''); // Clear the string representation of the array
      this.postMetaDataString.set(''); // Clear the post metadata string
      this.safeHtmlContent.set(''); // Clear the markdown string
      // this.preview = false;

      console.log(
        '>===>> Calling the function "getArticleDataBySlug" with: ',
        this.linkURL()
      );
      this.showExistingOrScrapeArticle();
    });

    // It captures directly any Electron message sent and passed via the "message-channel"
    // window.electronAPI.on('message-channel', (message: string) => {
    //   const msg: string = 'ELECTRON --> : ' + message;
    //   // It calls the dlgService to pop-up an error message:
    //   // this.testError(msg);
    //   this.dlgService
    //     .popup({
    //       token: 'error',
    //       header: 'Error!',
    //       content: msg,
    //       posAnsMsg: 'OK',
    //       negAnsMsg: '',
    //     })
    //     .subscribe((result) => {
    //       console.log('Dialog closed with:', result);
    //     });

    //   console.log('>===>>>', msg);
    // });
  }

  ngAfterViewInit() {
    // Capture and react to user selection changes
    this.categoryChangesSubscription = this.linkScrapeForm.controls['selectCategory'].valueChanges.subscribe((keys: string[]) => {
      // console.log('>===>> SingleUrl - ngAfterViewInit() - selected keys changed:', keys);
      this.selectedCategoryIds = keys.map(key => parseInt(key, 10)).filter(id => !isNaN(id));
      console.log('>===>> SingleUrl - ngAfterViewInit() - selectedCategoryIds:', this.selectedCategoryIds);
    });
  }
 
  
  ngOnDestroy() {
    this.categoryChangesSubscription?.unsubscribe();
  }


  setupForm() {
    this.linkScrapeForm = this.fb.group({
      url: this.fb.control('', [Validators.required]),
      force: this.fb.control(true),
      selectCategory: this.fb.control<string[]>([]),
    });
  }

  // submitForm(): void {
  //   if (this.linkScrapeForm.valid) {
  //     // console.log('submit', this.validateForm.value);
  //     const urlValue = this.linkScrapeForm.value.url;
  //     const rememberValue = this.linkScrapeForm.value.remember;
  //     console.log('Submitted URL: ', urlValue);
  //     this.convert(urlValue);
  //     // this.isSaveButtonEnabled.set(false);
  //   } else {
  //     Object.values(this.linkScrapeForm.controls).forEach((control) => {
  //       if (control.invalid) {
  //         control.markAsDirty();
  //         control.updateValueAndValidity({ onlySelf: true });
  //       }
  //     });
  //   }
  // }

  // onCategoryPicked() {
  //   const selectedNodes: NzTreeNode[] = this.catSel.getSelectedNodeList();
  //   const node = selectedNodes[0];               // single-select
  //   // Full original data used to build the node:
  //   const original = node?.origin;               // your { title, key, ...custom }
  //   console.log('>===>> Selected Category: node:', node, 'origin:', original);
  // }



  showExistingOrScrapeArticle() {
    from(this.getArticleDataBySlug(this.linkURL())).subscribe({
      next: (post) => {
        this.existingArticleData = post;
        console.log('>===>> URL Slug exists?', this.existingArticleData?.title);
        if (this.existingArticleData) {
          // this.loader.hide(); // Hide the loader if slug exists
          console.warn(
            '>===>> URL slug already exists in the database:',
            this.linkURL()
          );
          this.dlgService
            .popup({
              token: 'warn',
              header: 'Slug Exists',
              content: 'The URL Slug already exists in the database.',
              posAnsMsg: 'OK',
              negAnsMsg: '',
              delay: 500,
            })
            .subscribe((result) => {
              console.log('Dialog closed with:', result);
            });
          this.isNewArticle = false; // Set the flag to false for existing article
          // If the 'force' button is not checked and articleData is available, just show it
          // Else, scrape the article (either new or existing)
          if (this.isForcedChecked() === false) {
            this.showArticleData(this.existingArticleData); // Show the article data in the UI
          } else if (this.isForcedChecked() === true) {
            // ** Use the Loader ***
            // Scrape the Article!
            void this.loader.withLoader(
              () => this.srapeArticleData(this.linkURL()),
              'Scraping article data ...'
            );
          }
        } else {
          this.isNewArticle = true;
          this.existingArticleData = null;
          // ** Use the Loader ***
          // Scrape the Article!
          void this.loader.withLoader(
            () => this.srapeArticleData(this.linkURL()),
            'Scraping article data ...'
            );
        }
      },
      error: (err) => console.error('URL check failed:', err),
    });
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
        this.markdownString.set(''); // Clear the string representation of the array
      }
    }
  }

  onContentView() {
    // Toggle preview mode
    this.preview = !this.preview;
    if (this.markdownString().length === 0) return;
    if (this.preview) {
      this.markdownPreview(this.markdownString());
    } else {
      this.safeHtmlContent.set(''); // Clear the preview content
    }
  }

  onClear() {
    this.markdownString.set(''); // Clear the string representation of the array
    this.postMetaDataString.set(''); // Clear the post metadata string
    this.safeHtmlContent.set(''); // Clear the markdown string
    // this.preview = false;
    // this.linkScrapeForm.reset(); // Reset the form
  }

  onCopy() {
    const scrappedDataString = this.markdownString();
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

  onSave() {
    if (this.markdownString().length > 0) {
      this.runSaveMarkdownText();
    }
  }

  async runSaveMarkdownText() {
    const title: string = this.getFirstHeadingAsTitle(this.markdownString());
    try {
      const result = await window.electronAPI.invoke(
        'save-md-file',
        this.markdownString(),
        title
      );
    } catch (error) {
      console.error('Error saving Markdown File:', error);
    }
  }

  async markdownPreview(markdata: string) {
    // let rawHtml = await marked.parse(markdata);
    // if (rawHtml.trim().length === 0) rawHtml = '# No Markdown!';
    const safeHtml = this.markedService.render(markdata);
    this.safeHtmlContent.set(safeHtml);
  }

  getFirstHeadingAsTitle(markText: string): string {
    let matchHead: RegExpMatchArray | null = markText.match(/^#+\s+(.*)/m);
    if (matchHead) {
      console.log(matchHead[1]); // Output example: "My First Heading"
      return matchHead[1];
    } else {
      console.log('No heading Title found');
      return '';
    }
  }

  async srapeArticleData(urlValue: string) {
    let loading = true;
    let result = null;
    let error = null;
    // const urlValue = this.linkScrapeForm.value.url;

    let urlsArray: string[] = [];
    if (urlValue && urlValue.trim().length > 0) urlsArray.push(urlValue.trim());
    try {
      const scrapeOptions = this.contentScrapePolicy.buildScrapeTabsOptions(urlsArray);
      const response = await this.articlebasicscraper.scrapeTabsList(
        urlsArray,
        scrapeOptions
      );
      if (response.success) {
        let result: PostData[] = []; // default
        if (Array.isArray(response.data) && response.data.length > 0) {
          result = response.data as PostData[];
        }

        const excludedPosts = result.filter((post) => post.excludeFromPersistence);
        const allowedPosts = result.filter((post) => !post.excludeFromPersistence);

        if (excludedPosts.length > 0 && allowedPosts.length === 0) {
          const reason = excludedPosts[0].exclusionReason || 'excluded-page';
          this.scrappedDataArray.set([]);
          this.markdownString.set('');
          this.postMetaDataString.set('');
          this.safeHtmlContent.set('');

          this.dlgService
            .popup({
              token: 'warn',
              header: 'Page Excluded',
              content:
                'This page was excluded from scraping and DB persistence. Reason: ' +
                reason,
              posAnsMsg: 'OK',
              negAnsMsg: '',
            })
            .subscribe((res) => console.log('Dialog closed with:', res));

          return;
        }

        this.scrappedDataArray.set(allowedPosts);

        console.log('>===>> Scrapped Data Array length:', this.scrappedDataArray().length);
        console.log('>===>> Scrapped Data Array[0]:', this.scrappedDataArray()[0]);

        if (this.scrappedDataArray().length < 1) return;
        const postData: PostData = this.scrappedDataArray()[0];

        // this.isNewArticle = true; // Set the flag to true for new article

        // Insert scraped article(s) into DB
        if (this.scrappedDataArray().length > 0) {
          // this.onDBInsert();

          console.log('>===>> Is New Article? ', this.isNewArticle);
          // console.log(
          //   '>===>> Existing Article Data: ',
          //   this.existingArticleData
          // );

          // To-Do .... array for updating multiple articles ??? updateScrapedArticleById
          if (this.isNewArticle) {
            await this.insertScrapedArticlesArrayToDB(this.scrappedDataArray());
          } else if ( this.existingArticleData) {
            this.scrappedDataArray()[0].id = this.existingArticleData.id;
            console.log('>===>> Updating existing article ID:', this.scrappedDataArray()[0].id);
            await this.updateScrapedArticleById(this.scrappedDataArray()[0]);
          }

          // for (let i = 0; i < this.scrappedDataArray().length; i++) {
          //   const articleId = this.scrappedDataArray()[i].id;
          //   console.log('>===> Inserted article ID:', i, ' - ', articleId);
          // }

          // To-Do:
          // get the inserted article ids array

          // Show the article data in the UI after we have inserted it into the main DB
          this.showArticleData(postData);
        }
      } else {
        error = response.error;
      }
    } catch (err) {
      error = err;
    } finally {
      loading = false;
    }
  }

  showArticleData(postData: PostData) {
    const postMetaData: PostData = {
      id: postData.id, // added on 250821
      listname: this.listurldata.listname,
      pubauthorslug: this.listurldata.pubauthorslug,
      hostname: postData.hostname,
      timestamp: postData.timestamp,
      pubname: postData.pubname,
      authorname: postData.authorname,
      authorlink: postData.authorlink, // added on 250831
      title: postData.title,
      link: postData.link,
      image: postData.image,
      date: postData.date,
      likes: postData.likes,
      comments: postData.comments,
      ranking: postData.ranking, // added on 250820
    };
    this.postMetaDataString.set(JSON.stringify(postMetaData, null, 2));
    // Set the (Markdown) content of the first item
    // console.log('>===>> Article Content (postData.content): ', postData.content);
    this.markdownString.set(postData!.content!);
    // console.log(
    //   '>===>> Article Content (markdownString): ',
    //   this.markdownString()
    // );

    // *** To-Do:
    //

    this.markdownPreview(this.markdownString());

    // console.log(
    //   '>===>> Article Scraped Data: ',
    //   JSON.stringify(this.scrappedDataArray()[0])
    // );
  }




  async onDBInsert() {
    if (this.markdownString().length > 0) {
      await this.insertScrapedArticlesArrayToDB(this.scrappedDataArray());
    }
  }




  /**
   * Inserts the scraped data array into the main database.
   * Displays a dialog with the result of the insertion.
   * @param dataArray - The array of PostData to insert.
   */
  async insertScrapedArticlesArrayToDB(dataArray: PostData[]) {
    if (dataArray.length === 0) return;
    try {
      const insertedCount = await this.backendService.insertArticles(dataArray);
      if (insertedCount > 0) {

        

        // 250827
        // Insert images
        this.processMarkdownContentImages(dataArray); // Process images after insertion


        const urlSlug = getMediumSlugFromUrl(dataArray[0].link);
        // Process each article's content images
        const insertedArticleId = await this.backendService.getPostDataBySlug(urlSlug).then(addedArticle => addedArticle?.id);


        // 250902
        // Set article categories
        console.log('>===>> Setting categories for article ID:', insertedArticleId, ' - Categories:', this.selectedCategoryIds);
        if (this.selectedCategoryIds.length > 0) {
          // this.setArticleCategories(dataArray[0].id!, this.selectedCategoryIds);
          this.backendService.updateArticleCategoriesForSingleArticle(
            insertedArticleId!,
            this.selectedCategoryIds,
          ).then((res) => {
            console.log('>===>> Article categories updated successfully?', res);
          });
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





  async updateScrapedArticleById(articleData: PostData) {
    if (!articleData || articleData.id == null) return;

    // console.log('>===>> Updating article ID:', articleData.id, '- Content:', articleData.content);

    try {
      const result = await this.backendService.updateArticleById(articleData);
      if (result) {
        
        
        // 250827
        const dataArray: PostData[] = [articleData];
        this.processMarkdownContentImages(dataArray); // Process images after insertion

        const urlSlug = getMediumSlugFromUrl(dataArray[0].link);
        // Process each article's content images
        const updatedArticleId = await this.backendService.getPostDataBySlug(urlSlug).then(addedArticle => addedArticle?.id);

        // 250902
        // Set article categories
        console.log('>===>> Setting categories for article ID:', dataArray[0].id, ' - Categories:', this.selectedCategoryIds);
        if (this.selectedCategoryIds.length > 0) {
          // this.setArticleCategories(dataArray[0].id!, this.selectedCategoryIds);
          this.backendService.updateArticleCategoriesForSingleArticle(
            updatedArticleId!,
            this.selectedCategoryIds,
          ).then((res) => {
            console.log('>===>> Article categories updated successfully?', res);
          });
        }


        console.log('>===>> Article updated successfully:', articleData.id);
        this.dlgService
          .popup({
            token: 'succ',
            header: 'Article Updated!',
            content:
              'Article with id: ' +
              articleData.id +
              ' was updated to the main DB.',
            posAnsMsg: 'OK',
            negAnsMsg: '',
          })
          .subscribe((res) => console.log('Dialog closed with:', res));
      } else {
        console.error('>===>> Failed to update article by id:', articleData.id);
        this.dlgService
          .popup({
            token: 'error',
            header: 'Error',
            content: 'Failed to update article with id: ' + articleData.id,
            posAnsMsg: 'OK',
            negAnsMsg: '',
          })
          .subscribe((res) => console.log('Dialog closed with:', res));
      }
    } catch (error) {
      console.error('Error updating article by id:', error);
    }
  }

  /**
   * Checks if a URL slug already exists in the 'articles' table.
   * @param {string} urlString - The URL to check for slug existence.
   * @returns {boolean} - Returns true if the URL slug exists, false otherwise.
   */
  async isSlugExisting(urlString: string): Promise<boolean> {
    if (!window.electronAPI) {
      console.error('>===>> No Main DB connection.');
      return false;
    }
    const urlSlug = getMediumSlugFromUrl(urlString);

    try {
      const exists = await this.backendService.checkSlugExists(urlSlug);
      console.log('>===>> URL exists:', exists);
      return exists; // true or false
    } catch (error) {
      console.error('Error checking if URL exists:', error);
      return false; // default fallback
    }
  }

  /**
   * Returns article data (PostData) by its URL slug, or null if not found.
   * @param {string} urlString - The URL to check for existence.
   * @returns {PostData | null} - Returns the article data if found, or null if not found.
   */
  async getArticleDataBySlug(urlString: string): Promise<PostData | null> {
    if (!window.electronAPI) {
      console.error('>===>> No Main DB connection.');
      return null;
    }

    const urlSlug = getMediumSlugFromUrl(urlString);
    console.log('>===>> URL slug to be checked: ', urlSlug);

    try {
      const articleData = await this.backendService.getPostDataBySlug(urlSlug);
      console.log('>===>> Article data fetched by slug:', articleData?.title);
      return articleData; // Returns PostData or null if not found
    } catch (error) {
      console.error('Error fetching article data by slug:', error);
      return null; // default fallback
    }
  }


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
              this.markdownString.set(updatedContent); // Update the preview with new content
              // console.log(
              //   '>===>> Article Content (Updated markdownString): ',
              //   this.markdownString()
              // );
              this.markdownPreview(updatedContent); // Refresh the preview
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

  // 250903
  // Set/Update the article's category(-ies)
  async setArticleCategories(articleId: number, categories: number[]) {
    console.log('>===>> Setting/updating categories for Article ID:', articleId);
    const result = await this.backendService.insertArticleCategories(articleId, categories);
    if (result) {
      console.log('>===>> Article Categories inserted/updated successfully:', categories);
    } else {
      console.error('>===>> Failed to insert/update categories for Article ID:', articleId);
    }
    return result;
  }

}


