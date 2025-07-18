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
import { Articlebasicscraper } from '../services/articlebasicscraper';
import { PostData } from '../../../shared/projectObjects/varObjects'; // Import the PostData interface

// Adjust the import path as necessary

@Component({
  selector: 'app-article',
  imports: [
    ReactiveFormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
    FormsModule,
  ],
  templateUrl: './article.html',
  styleUrl: './article.scss',
})
export class Article {
  private fb = inject(NonNullableFormBuilder);
  public validateForm!: FormGroup;
  private scrapper = inject(Articlebasicscraper);
  // public scrappedData = "";
  public scrappedError = signal<string>('');
  public scrappedData = signal<PostData | null>(null);
  public scrappedDataArray = signal<PostData[]>([]);
  public scrappedDataArrayString = signal<string>('');
  // public isSaveButtonEnabled = signal<boolean>(false);
  public isAddedChecked = signal<boolean>(true); // Default to true

  ngOnInit(): void {
    this.validateForm = this.fb.group({
      url: this.fb.control('', [Validators.required]),
      add: this.fb.control(true),
    });
    this.validateForm.get('add')?.valueChanges.subscribe((value) => {
      console.log('Checkbox changed to:', value);
      this.isAddedChecked.set(value); // Update the signal when checkbox changes
    });
  }

  submitForm(): void {
    if (this.validateForm.valid) {
      // console.log('submit', this.validateForm.value);
      const urlValue = this.validateForm.value.url;
      const rememberValue = this.validateForm.value.remember;
      console.log('Submitted URL: ', urlValue);
      this.runScraper(urlValue);
      // this.isSaveButtonEnabled.set(false);
    } else {
      Object.values(this.validateForm.controls).forEach((control) => {
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

    try {
      const response = await this.scrapper.scrapeArticle(url);
      if (response.success) {
        result = response.data;
        this.scrappedData.set(response.data as PostData); // Store the result as PostData
        // this.isSaveButtonEnabled.set(true);
      } else {
        // result = { error: response.error };
        this.scrappedError.set(JSON.stringify(response.error));
        // this.isSaveButtonEnabled.set(false);
      }
    } catch (err) {
      result = { error: err };
      this.scrappedError.set(JSON.stringify(err));
      // this.isSaveButtonEnabled.set(false);
    } finally {
      loading = false;
    }

    console.log('Scraper data:', JSON.stringify(result));

    const currentData = this.scrappedData();
    if (currentData !== null) {
      if (!this.isAddedChecked()) {
        this.scrappedDataArray.set([]); // Clear the array if 'add' is not checked
      }
      this.scrappedDataArray.set([...this.scrappedDataArray(), currentData]); // Update the array with the new result
    }
    this.scrappedDataArrayString.set(JSON.stringify(this.scrappedDataArray())); // Update the string representation of the array

    // this.scrappedData = JSON.stringify(result); // Store the result as a string
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
      const urlControl = this.validateForm.get('url');
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
    this.validateForm.reset(); // Reset the form
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
    if (this.scrappedDataArray().length > 0 ) {
      this.runSaveScappedData();
    }
  }

  async runSaveScappedData() {
  try {
    const result = await window.electronAPI.invoke('save-scrapped-data', this.scrappedDataArrayString());
    } catch (error) {
    console.error('Error saving scrapped data:', error);
    }
  }

}
