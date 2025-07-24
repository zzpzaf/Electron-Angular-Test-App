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

// Adjust the import path as necessary

@Component({
  selector: 'app-article',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
  ],
  templateUrl: './article.html',
  styleUrl: './article.scss',
})
export class Article {
  private fb = inject(NonNullableFormBuilder);
  public linkScrapeForm!: FormGroup;
  private scrapper = inject(Articlebasicscraper);
  // public scrappedData = "";
  public scrappedError = signal<string>('');
  public scrappedData = signal<PostData | null>(null);
  public scrappedDataArray = signal<PostData[]>([]);
  public scrappedDataArrayString = signal<string>('');
  // public isSaveButtonEnabled = signal<boolean>(false);
  public isAddedChecked = signal<boolean>(true); // Default to true
  public linkURL = signal<string>('');
  private listurldata: listURLData = { listname: '', pubauthorslug: '' };

  // private modal = inject(NzModalService);
  private dlgService = inject(DlgService);
  // constructor(private dlgService: DlgService){  }

  // private modalRef = inject(NzModalRef);

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
        this.listurldata = analyzeListedLink(urlValue);
        // console.log('List Name (if):', this.listurldata.listname.trim());
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
          negAnsMsg: ''
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
      this.runScraper(urlValue);
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
      if (this.listurldata.listname.trim().length > 0) {
        const response = await this.scrapper.scrapeList(url);
        if (response.success) {
          this.scrappedDataArray.set(response.data as PostData[]); // Store the result as PostData[]
          result = response.data;
        } else {
          result = response.error;
        }
      } else {
        const response = await this.scrapper.scrapeArticle(url);
        if (response.success) {
          this.scrappedData.set(response.data as PostData); // Store the result as PostData
          result = response.data;
          const currentData = this.scrappedData();
          if (currentData !== null) {
            if (!this.isAddedChecked()) {
              this.scrappedDataArray.set([]); // Clear the array if 'add' is not checked
            }
            this.scrappedDataArray.set([
              ...this.scrappedDataArray(),
              currentData,
            ]); // Update the array with the new result
          }
        } else {
          if (response.error) this.scrappedError.set(response.error);
        }
      }
    } catch (err) {
      // result = { error: err };
      if (err) this.scrappedError.set(JSON.stringify({ err }));
    } finally {
      loading = false;
    }

    if (result) {
      console.log('Scraper data:', JSON.stringify(result));
      this.scrappedDataArrayString.set(
        JSON.stringify(this.scrappedDataArray(), null, 2)
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
        this.scrappedDataArrayString.set(''); // Clear the string representation of the array
      }
    }
  }

  onClearScrappedData() {
    this.scrappedDataArray.set([]); // Clear the array
    this.scrappedDataArrayString.set(''); // Clear the string representation of the array
    this.scrappedData.set(null); // Clear the scrapped data
    this.linkScrapeForm.reset(); // Reset the form
  }

  onCopyScrappedData() {
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

  onSaveScrappedData() {
    if (this.scrappedDataArray().length > 0) {
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
          this.scrappedDataArrayString(),
          this.listurldata
        );
      } else {
        const result = await window.electronAPI.invoke(
          'save-scrapped-data',
          this.scrappedDataArrayString()
        );
      }
    } catch (error) {
      console.error('Error saving scrapped data:', error);
    }
  }


  // popupConfirm(msg: string) {
  //   this.dlgService
  //     .confirm(
  //       'Please Confirm!',
  //       'Are you sure you want to delete this?',
  //       'Delete',
  //       'Cancel'
  //     )
  //     .subscribe((result) => {
  //       console.log('Confirm dialog result:', result);
  //     });
  // }

  // popupInfo(msg: string) {
  //   // this.dlgService.info('Info', 'This is an informational message.')
  //   this.dlgService.info('Info', msg).subscribe((result) => {
  //     console.log('Info dialog closed:', result);
  //   });
  // }

  // popupSuccess(msg: string) {
  //   this.dlgService
  //     .success('Success', 'Your action was successful!')
  //     .subscribe((result) => {
  //       console.log('Success dialog closed:', result);
  //     });
  // }

  // popupError(msg: string) {
  //   this.dlgService.error('Error', msg).subscribe((result) => {
  //     console.log('Error dialog closed:', result);
  //   });
  // }

  // popupWarning(msg: string) {
  //   this.dlgService
  //     .warning('Warning', 'Be careful with this action.')
  //     .subscribe((result) => {
  //       console.log('Warning dialog closed:', result);
  //     });
  // }
}
