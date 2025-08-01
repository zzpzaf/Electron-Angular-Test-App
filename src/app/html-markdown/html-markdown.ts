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
    const result = (await window.electronAPI.invoke(
      'convert-html-to-markdown',
      {
        input: url, // URL or raw HTML string
        isRawHtml: false, // set to true if passing raw HTML
      }
    )) as { success: boolean; markdown?: string; error?: string };
    if (result.success) {
      console.log('✅ Markdown:', result.markdown);
      this.markdownString.set(result.markdown!);
    } else {
      console.error('❌ Conversion failed:', result.error);
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
    const rawHtml = await marked.parse(markdata);
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
}
