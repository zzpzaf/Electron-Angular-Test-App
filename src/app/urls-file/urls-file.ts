import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { StyleDrct } from '../shared/style-drct';
import { extractAllNonImageUrls } from '../../../shared/utils/shared-utils';
import { DlgService } from '../shared/services/dlg-service';
import { Articlebasicscraper } from '../shared/services/articlebasicscraper';
import { PostData } from '../../../shared/projectObjects/varObjects';
import { FikeDrop } from '../../../scratch/fike-drop';

@Component({
  selector: 'urls-file',
  imports: [
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
    StyleDrct,
  ],
  templateUrl: './urls-file.html',
  styleUrl: './urls-file.scss',
})
export class UrlsFile {
  public importedUrlsArrayString = signal<string>('');

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
  private dlgService = inject(DlgService);
  private scrapper = inject(Articlebasicscraper);

  // private fileDropService = inject(FikeDrop);
  // filePath = this.fileDropService.$filePath;

  constructor() {
    // effect(() => {
    //   const path = this.filePath();
    //   if (path) {
    //     console.log('📂 Component sees dropped path:', path);
    //     // you can read file, parse JSON, etc
    //   }
    // });
  }

  async onScrape(): Promise<void> {
    let loading = true;
    let result = null;
    let error = null;
    // let scrapedData: PostData;

    const urls = this.urlsArray();
    if (!urls.length) return;

    try {
      const response = await this.scrapper.scrapeTabsList(urls);
      if (response.success) {
        result = response.data;
        this.scrappedDataArray.set(result);

        if (this.scrappedDataArray().length > 0) {
          this.scrappedDataArrayString.set(
            JSON.stringify(this.scrappedDataArray(), null, 2)
          );
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

  onGetFileUrls() {
    this.getFileFromElectron().catch((err) =>
      console.error('Unexpected error calling Electron:', err)
    );
  }

  private async getFileFromElectron(): Promise<void> {
    try {
      const result = (await window.electronAPI.invoke('open-file-dialog')) as {
        success: boolean;
        message: string;
        filePath?: string;
        data?: string;
        error?: string;
      };

      this.heandleResultFromReadFile(result);
    } catch (err) {
      console.error('IPC invoke failed:', err);
    }
  }

  private heandleResultFromReadFile(result: any) {
    if (result.success && result.data) {
      console.log('File path:', result.filePath);
      this.fileName = result.filePath!;
      console.log('File data:', result.data);
      const urls = extractAllNonImageUrls(result.data);

      const uniqueURLs = Array.from(new Set(urls));
      // this.scrappedDataArray.set(urls.split(','));
      this.urlsArray.set(uniqueURLs);

      const msg: string = this.urlsArray().length + ' URLs found in total!';
      this.dlgService
        .popup({
          token: 'succ',
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

      // if (result.filePath?.endsWith('.json')) {
      //   try {
      //     const jsonData = JSON.parse(result.data);
      //     console.log('Parsed JSON:', jsonData);
      //     this.importedUrlsArrayString.set(jsonData);
      //   } catch (parseErr) {
      //     console.error('Invalid JSON format:', parseErr);
      //   }
      // }
    } else {
      console.log('Message:', result.message);
      if (result.error) {
        console.error('Error:', result.error);
      }
    }
  }

  onClearScrapedData() {
    this.scrappedDataArray.set([]); // Clear the Scraped Data array
    this.scrappedDataArrayString.set(''); // Clear the string representation of the Scraped Data array
    this.importedUrlsArrayString.set(''); // Clear the imported URLs
    this.fileName = '';
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
}
