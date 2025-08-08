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
  templateUrl: './html-markdown.html',
  styleUrl: './html-markdown.scss',
})
export class HtmlMarkdown {
  private fb = inject(NonNullableFormBuilder);
  private scrapper = inject(Articlebasicscraper);
  public scrappedDataArray = signal<PostData[]>([]);

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

  constructor() {}

  ngOnInit(): void {
    this.setupForm();
    this.linkScrapeForm.get('add')?.valueChanges.subscribe((value) => {
      console.log('Checkbox changed to:', value);
      this.isAddedChecked.set(value); // Update the signal when checkbox changes
    });
    this.linkScrapeForm.get('url')?.valueChanges.subscribe((urlValue) => {
      this.linkURL.set(urlValue);
      this.listurldata = { listname: '', pubauthorslug: '' };

      if (urlValue.trim().length > 0 && isValidUrl(urlValue.trim())) {
        console.log('URL changed to:', this.linkURL());
        this.markdownString.set(''); // Clear the string representation of the array
        this.safeHtmlContent.set(''); // Clear the markdown string
        this.preview = false;
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

  setupForm() {
    this.linkScrapeForm = this.fb.group({
      url: this.fb.control('', [Validators.required]),
      add: this.fb.control(true),
    });
  }

  submitForm(): void {
    if (this.linkScrapeForm.valid) {
      // console.log('submit', this.validateForm.value);
      const urlValue = this.linkScrapeForm.value.url;
      const rememberValue = this.linkScrapeForm.value.remember;
      console.log('Submitted URL: ', urlValue);
      this.convert(urlValue);
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

  async convert(url: string) {
    
    // const scrapedPostData = await this.srapeBasicData();
    await this.srapeArticleData(); // Adds/Sets the scraped data to the scrappedDataArray
    if (this.scrappedDataArray().length === 1) {
      this.markdownString.set(this.scrappedDataArray()[0].content!); // Set the content of the first item
      console.log('>===>> Article Scraped Data: ', JSON.stringify(this.scrappedDataArray()[0]));
    } else {
      console.error('❌ Scraped failed!');
    }
    
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

  onPreview() {
    // Toggle preview mode
    this.preview = !this.preview;
    if (this.markdownString().length === 0) return;
    this.markdownPreview(this.markdownString());
  }

  onClear() {
    this.markdownString.set(''); // Clear the string representation of the array
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

  async srapeArticleData() {
    let loading = true;
    let result = null;
    let error = null;
    const urlValue = this.linkScrapeForm.value.url;

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
      this.runInsertScrapedArrayToDB(this.scrappedDataArray());
    }
  }

  async runInsertScrapedArrayToDB(dataArray: PostData[]) {
    if (dataArray.length === 0) return;

    try {
      if (dataArray.length > 0) {
        const result = (await window.electronAPI.invoke(
          'sqlite:insert-articles-from-json-array',
          dataArray
        )) as number;

        if (result > 0) {
          this.dlgService
            .popup({
              token: 'succ',
              header: 'URLs Inserted!',
              content: result + ' URLs were inserted to the main DB.',
              posAnsMsg: 'OK',
              negAnsMsg: '',
            })
            .subscribe((res) => console.log('Dialog closed with:', res));
        } else {
          console.error('Unexpected result from DB insert:', result);
          this.dlgService
            .popup({
              token: 'error',
              header: 'Error',
              content: 'Failed to insert URLs to the main DB.',
              posAnsMsg: 'OK',
              negAnsMsg: '',
            })
            .subscribe((res) => console.log('Dialog closed with:', res));
        }

        console.log('>===>> Inserted URLs to main DB:', result);
      }
    } catch (error) {
      console.error('Error inserting URLs to main DB:', error);
    }
  }
}
