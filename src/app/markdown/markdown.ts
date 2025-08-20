import { Component, inject, signal } from '@angular/core';
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

// import { marked } from 'marked';
import { SafeHtml } from '@angular/platform-browser';
import { BackEnd } from '../shared/services/back-end';
import { from } from 'rxjs';
import { Markshow } from '../shared/services/markshow';
import { LoaderService } from '../shared/services/loader-service';

@Component({
  selector: 'sel-html-markdown',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
  ],
  templateUrl: './markdown.html',
  styleUrl: './markdown.scss',
})
export class Markdown {
  private fb = inject(NonNullableFormBuilder);
  private scrapper = inject(Articlebasicscraper);
  public scrappedDataArray = signal<PostData[]>([]);
  public postMetaDataString = signal<string>('');
  public linkScrapeForm!: FormGroup;

  // public scrappedData = "";
  public scrappedError = signal<string>('');

  public markdownString = signal<string>('');
  // public isSaveButtonEnabled = signal<boolean>(false);
  public isAddedChecked = signal<boolean>(true); // Default to true
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

  public isNewArticle: boolean = false; // Flag to indicate if it's a new article

  constructor() {}

  ngOnInit(): void {
    this.setupForm();
    this.linkScrapeForm.get('add')?.valueChanges.subscribe((value) => {
      console.log('Checkbox changed to:', value);
      this.isAddedChecked.set(value); // Update the signal when checkbox changes
    });
    this.linkScrapeForm.get('url')?.valueChanges.subscribe((urlValue) => {
      if (urlValue.trim().length === 0 || !isValidUrl(urlValue.trim())) return;

      // this.loader.show(); // Show the loader when URL changes

      console.log('>===>> URL changed to:', urlValue);


      this.listurldata = { listname: '', pubauthorslug: '' };
      this.listurldata = analyzeListedLink(urlValue);

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

      // this.convert(this.linkURL());
      // Call the scraping function with the updated URL
      // Adds/Sets the scraped data to the scrappedDataArray

      console.log('>===>> Calling the function "getArticleDataBySlug" with: ', this.linkURL());
      from(this.getArticleDataBySlug(this.linkURL())).subscribe({
        next: (articleData) => {
          console.log('>===>> URL Slug exists?', articleData?.title);
          if (articleData) {
            // this.loader.hide(); // Hide the loader if slug exists
            console.warn('>===>> URL slug already exists in the database:', this.linkURL());
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
            this.showArticleData(articleData); // Show the article data in the UI  

          } else {
            // this.srapeArticleData(this.linkURL());
            // ** Use the Loader ***
            // fire-and-forget (subscribe ignores returned Promise)
            void this.loader.withLoader(
              () => this.srapeArticleData(this.linkURL()),
              'Scraping article data ...'
            );
          }
        },
        error: (err) => console.error('URL check failed:', err),
      });
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

  setupForm() {
    this.linkScrapeForm = this.fb.group({
      url: this.fb.control('', [Validators.required]),
      add: this.fb.control(true),
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
    if (this.preview){
      this.markdownPreview(this.markdownString());
    } else {
      this.safeHtmlContent.set(""); // Clear the preview content
    }
  }

  onClear() {
    this.markdownString.set(''); // Clear the string representation of the array
    this.postMetaDataString.set(''); // Clear the post metadata string
    this.safeHtmlContent.set(''); // Clear the markdown string
    // this.preview = false;
    this.linkScrapeForm.reset(); // Reset the form
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

  // async convert(url: string) {
  //   console.log('>===>> URL changed to:', this.linkURL());
  //   console.log('>===>> URL:', url);

  //   if (!isValidUrl(url)) {
  //     this.scrappedError.set('Invalid URL provided.');
  //     console.error('❌ Invalid URL:', url);
  //     return;
  //   }
  //   // const scrapedPostData = await this.srapeBasicData();
  //   await this.srapeArticleData(url); // Adds/Sets the scraped data to the scrappedDataArray
  // }

  async srapeArticleData(urlValue: string) {
    let loading = true;
    let result = null;
    let error = null;
    // const urlValue = this.linkScrapeForm.value.url;

    let urlsArray: string[] = [];
    if (urlValue && urlValue.trim().length > 0) urlsArray.push(urlValue.trim());
    try {
      const response = await this.scrapper.scrapeTabsList(urlsArray);
      if (response.success) {
        let result: PostData[] = []; // default
        if (Array.isArray(response.data) && response.data.length > 0) {
          result = response.data as PostData[];
        }
        this.scrappedDataArray.set(result);

        if (this.scrappedDataArray().length < 1) return;
        const postData: PostData = this.scrappedDataArray()[0];

        this.isNewArticle = true; // Set the flag to true for new article

        this.showArticleData(postData); // Show the article data in the UI

        if (
          this.linkScrapeForm.get('add')?.value === true &&
          this.scrappedDataArray().length > 0
        ) {
          // this.onDBInsert();
          await this.insertScrapedArrayToDB(this.scrappedDataArray());
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

  showArticleData( postData: PostData) {

    const postMetaData: PostData = {
      listname: this.listurldata.listname,
      pubauthorslug: this.listurldata.pubauthorslug,
      hostname: postData.hostname,
      timestamp: postData.timestamp,
      pubname: postData.pubname,
      authorname: postData.authorname,
      title: postData.title,
      link: postData.link,
      image: postData.image,
      date: postData.date,
      likes: postData.likes,
      comments: postData.comments,
    };
    this.postMetaDataString.set(JSON.stringify(postMetaData, null, 2));
    // Set the (Markdown) content of the first item
    this.markdownString.set(postData.content!);
    this.markdownPreview(this.markdownString());

  // console.log(
  //   '>===>> Article Scraped Data: ',
  //   JSON.stringify(this.scrappedDataArray()[0])
  // );

  // console.log(
  //   '>===>> Add/Insert into DB? ',
  //   this.linkScrapeForm.get('add')?.value
  // );

}



  onDBInsert() {
    if (this.markdownString().length > 0) {
      this.insertScrapedArrayToDB(this.scrappedDataArray());
    }
  }

  /**
   * Inserts the scraped data array into the main database.
   * Displays a dialog with the result of the insertion.
   * @param dataArray - The array of PostData to insert.
   */
  async insertScrapedArrayToDB(dataArray: PostData[]) {
    if (dataArray.length === 0) return;
    try {
      const insertedCount = await this.backendService.insertArticles(dataArray);
      if (insertedCount > 0) {
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
            content: 'Failed to insert articles to the main DB.',
            posAnsMsg: 'OK',
            negAnsMsg: '',
          })
          .subscribe((res) => console.log('Dialog closed with:', res));
      }
    } catch (err) {
      console.error('Error inserting URLs to main DB:', err);
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

    try {
      const articleData = await this.backendService.getPostDataBySlug(urlSlug);
      console.log('>===>> Article data fetched by slug:', articleData?.title);
      return articleData; // Returns PostData or null if not found
    } catch (error) {
      console.error('Error fetching article data by slug:', error);
      return null; // default fallback
    }
  }


}
