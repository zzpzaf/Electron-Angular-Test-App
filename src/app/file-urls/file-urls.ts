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

@Component({
  selector: 'file-urls',
  imports: [
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
    StyleDrct,
  ],
  templateUrl: './file-urls.html',
  styleUrl: './file-urls.scss',
})
export class FileUrls {
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
        result = response.data as PostData[]; // default
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
    const dlgOptions = {
      title: 'Open .txt or .json Files',
      filters: [{ name: 'Text and JSON', extensions: ['txt', 'json'] }],
    };
    try {
      const result = (await window.electronAPI.invoke(
        'open-file-dialog',
        dlgOptions
      )) as {
        success: boolean;
        message: string;
        filePath?: string;
        error?: string;
      };

      console.log('>===>> File selected: ', result.filePath);

      if (result.success && result.filePath) {
        this.fileName = result.filePath!;
        this.getDataFromFile(this.fileName);
      }
    } catch (err) {
      console.error('IPC open-file-dialog invoke failed:', err);
    }
  }

  private async getDataFromFile(filePathName: string) {
    console.log('>===>> File to be read: ', filePathName);

    let data: string = '';

    try {
      // Read Data
      data = (await window.electronAPI.invoke(
        'read-file-data',
        filePathName
      )) as string;
      if (data.length === 0) {
        console.log('No Data read from File!');
        return;
      }
      console.log('Data read from File: ', data);

      //Extract URLs
      const urls = extractAllNonImageUrls(data);
      const uniqueURLs = Array.from(new Set(urls));
      this.urlsArray.set(uniqueURLs);

      // Show message in modal dialog
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
    } catch (error) {
      console.log('Error reading Data from File:', error);
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
