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
  isValidUrl,
} from '../../../shared/utils/shared-utils';

import { DlgService } from '../shared/services/dlg-service';

import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BackEnd } from '../shared/services/back-end';
import { from } from 'rxjs';

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

  public preview: boolean = false;
  public safeHtmlContent = signal<SafeHtml | null>(null);
  private sanitizer = inject(DomSanitizer);

  private backendService = inject(BackEnd);

  constructor() {}

  ngOnInit(): void {
    this.setupForm();
    this.linkScrapeForm.get('add')?.valueChanges.subscribe((value) => {
      console.log('Checkbox changed to:', value);
      this.isAddedChecked.set(value); // Update the signal when checkbox changes
    });
    this.linkScrapeForm.get('url')?.valueChanges.subscribe((urlValue) => {
      if (urlValue.trim().length === 0 || !isValidUrl(urlValue.trim())) return;

      this.listurldata = { listname: '', pubauthorslug: '' };
      this.listurldata = analyzeListedLink(urlValue);

      // Get the clean URL without the query parameters part
      const fullUrl = new URL(urlValue.trim());
      const clearUrl = fullUrl.origin + fullUrl.pathname;
      this.linkURL.set(clearUrl);


      // console.log('URL changed to:', this.linkURL());
      this.markdownString.set(''); // Clear the string representation of the array
      this.postMetaDataString.set(''); // Clear the post metadata string
      this.safeHtmlContent.set(''); // Clear the markdown string
      this.preview = false;

      // this.convert(this.linkURL());
      // Call the scraping function with the updated URL
      // Adds/Sets the scraped data to the scrappedDataArray

      from(this.isUrlExisting(this.linkURL())).subscribe({
        next: (isExisting) => {
          console.log('>===>> URL exists:', isExisting);
          if (isExisting) {
            console.warn('URL already exists in the database:', this.linkURL());
            this.dlgService
              .popup({
                token: 'warn',
                header: 'URL Exists',
                content: 'This URL already exists in the database.',
                posAnsMsg: 'OK',
                negAnsMsg: '',
                delay: 500,
              })
              .subscribe((result) => {
                console.log('Dialog closed with:', result);
              });

          } else {
            this.srapeArticleData(this.linkURL());
          }
        },
        error: (err) => console.error('URL check failed:', err),
      });
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

  onPreview() {
    // Toggle preview mode
    this.preview = !this.preview;
    if (this.markdownString().length === 0) return;
    this.markdownPreview(this.markdownString());
  }

  onClear() {
    this.markdownString.set(''); // Clear the string representation of the array
    this.postMetaDataString.set(''); // Clear the post metadata string
    this.safeHtmlContent.set(''); // Clear the markdown string
    this.preview = false;
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
    let rawHtml = await marked.parse(markdata);
    if (rawHtml.trim().length === 0) rawHtml = '# No Markdown!';
    const safeHtml = this.sanitizer.bypassSecurityTrustHtml(rawHtml);

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
        // this.scrappedDataArray.set(result as PostData[]);
        //this.scrappedDataArrayString.set(JSON.stringify(result, null, 2));

        if (this.scrappedDataArray().length < 1) return;

        const postData: PostData = this.scrappedDataArray()[0];
        // Set the post metadata
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

        // console.log(
        //   '>===>> Article Scraped Data: ',
        //   JSON.stringify(this.scrappedDataArray()[0])
        // );

        // console.log(
        //   '>===>> Add/Insert into DB? ',
        //   this.linkScrapeForm.get('add')?.value
        // );
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

  /*
   * Checks if a URL already exists in the 'articles' table.
   * @param {string} urlString - The URL to check for existence.
   * @returns {boolean} - Returns true
   * if the URL exists, false otherwise.
   */
  async isUrlExisting(urlString: string): Promise<boolean> {
    if (!window.electronAPI) {
      console.error('>===>> No Main DB connection.');
      return false;
    }

    try {
      const exists = await this.backendService.checkUrlExists(urlString);
      console.log('>===>> URL exists:', exists);
      return exists; // true or false
    } catch (error) {
      console.error('Error checking if URL exists:', error);
      return false; // default fallback
    }
  }
}
