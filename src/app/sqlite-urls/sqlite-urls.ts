import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { StyleDrct } from '../shared/style-drct';
import { DlgService } from '../shared/services/dlg-service';
import { Articlebasicscraper } from '../shared/services/articlebasicscraper';
import { LinkRow, PostData } from '../../../shared/projectObjects/varObjects';
import { BackEnd } from '../shared/services/back-end';

@Component({
  selector: 'sqlite-urls',
  imports: [
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
    StyleDrct,
  ],
  templateUrl: './sqlite-urls.html',
  styleUrl: './sqlite-urls.scss',
})
export class SqliteUrls {
  public importedUrlsArrayString = signal<string>('');

  public urlsArray = signal<string[]>([]);
  public queryResponseData: any;
  public urlsArrayString = signal<string>('');

  public scrappedDataArray = signal<PostData[]>([]);
  public scrappedDataArrayString = signal<string>('');

  public sqliteFileName = signal<string>('');
  public bookmarkFolder: string = '';
  // public mycond: boolean = false;
  public customStyles = {
    color: 'dimgray',
    // backgroundColor: 'teal',
    // fontSize: '20px',
    // padding: '10px'
  };
  private dlgService = inject(DlgService);
  private scrapper = inject(Articlebasicscraper);

  private backService = inject(BackEnd);
  private sqliteFullPathName: string = '';

  constructor() {
    this.loaSqliteFullPathName();
  }


  async loaSqliteFullPathName() {
    try {
      this.sqliteFullPathName = await this.backService.getPropertyValueBySubstring(
        'lastObtainedFullPathname',
        'places.sqlite'
      );
      console.log('Property value:', this.sqliteFullPathName);
      if (this.sqliteFullPathName.length > 0)
      this.sqliteFileName.set(this.sqliteFullPathName);
    } catch (err) {
      console.error('Error retrieving property:', err);
    }
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

  onGetSqliteFile() {
    this.getFileFromElectron().catch((err) =>
      console.error('Unexpected error calling Electron:', err)
    );
  }

  onGetBookmarkFolderUrls() {
    if (this.bookmarkFolder.length === 0) return;
    this.getContentsFromBookmarksFolder(this.sqliteFileName());
  }

  private async getFileFromElectron(): Promise<void> {
    const dlgOptions = {
      title: 'Open .sqlite Files',
      filters: [{ name: 'SQLite Files', extensions: ['sqlite'] }],
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
        this.sqliteFileName.set(result.filePath!);
      }
    } catch (err) {
      console.error('IPC open-file-dialog invoke failed:', err);
    }
  }

  private async getContentsFromBookmarksFolder(sqliteFilePathName: string) {
    const bookmarksFolderName: string = this.bookmarkFolder; //'Reactive-Material';

    const qRes = (await window.electronAPI.invoke(
      'sqlite:get-folder-contents',
      sqliteFilePathName,
      bookmarksFolderName
    )) as { success: boolean; data?: any; error?: string };

    if (qRes.success) {
      console.log('Bookmarks Folder Contents: ', qRes.data);
      this.queryResponseData = qRes.data as LinkRow[];

      let urls: string[] = [];
      for (const row of qRes.data as LinkRow[]) {
        let link: string | null = row.link;
        if (link) {
          urls.push(link);
        }
      }
      const uniqueURLs = Array.from(new Set(urls));
      this.urlsArray.set(uniqueURLs);

      // Show message in modal dialog
      const msg: string = this.urlsArray().length + ' unique URLs found in total!';
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

    } else {
      console.error(
        'IPC sqlite:get-folder-contents - Bookmarks Folder Contents Query failed:',
        qRes.error
      );
    }
  }

  onClearScrapedData() {
    this.scrappedDataArray.set([]); // Clear the Scraped Data array
    this.scrappedDataArrayString.set(''); // Clear the string representation of the Scraped Data array
    this.importedUrlsArrayString.set(''); // Clear the imported URLs
    this.sqliteFileName.set('');
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
