import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { StyleDrct } from '../shared/style-drct';
import { DlgService } from '../shared/services/dlg-service';
import { Articlebasicscraper } from '../shared/services/articlebasicscraper';
import {
  FolderNode,
  LinkRow,
  PostData,
} from '../../../shared/projectObjects/varObjects';
import { BackEnd } from '../shared/services/back-end';
import { NzTreeNodeOptions } from 'ng-zorro-antd/tree';
import { NzTreeSelectModule } from 'ng-zorro-antd/tree-select';

const rootFolderName = 'unfiled';  // id = 5

function mapFolderNodesToTree(nodes: FolderNode[]): NzTreeNodeOptions[] {
  return nodes.map((n) => ({
    key: String(n.folder_id),
    // title: n.folder_name ?? '(untitled)',
    title:
      n.folder_name !== null && n.folder_name !== undefined
        ? n.folder_name + '-' + String(n.folder_id)
        : '(untitled)',
    children: n.children ? mapFolderNodesToTree(n.children) : [],
    isLeaf: !n.children || n.children.length === 0,
  }));
}

@Component({
  selector: 'bookmarks',
  imports: [
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
    NzTreeSelectModule,
    StyleDrct,
  ],
  templateUrl: './bookmarks.html',
  styleUrl: './bookmarks.scss',
})
export class Bookmarks {
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

  // private backService = inject(BackEnd);
  // private workingPlacesSqliteFullPathName: string = '';

  public treeNodes: NzTreeNodeOptions[] = [];
  public selectedFolderName: string = '';
  public fullSelectedNodePathLabel = signal<string>('Bookmark Folder Name');
  private selectedfolderNodeId: number = -1;
  // private countedUniqueLinks = signal<number>(-1);
  public imoprtedUrlsLabel = signal<string>('Imported URLs');

  constructor() {
    // this.getSqliteFullPathName();
    // this.showBookmarksFolderTree();
  }

  ngOnInit() {
    this.showBookmarksFolderTree();
  }

  async showBookmarksFolderTree() {
    // const rootFolderName = 'Other Bookmarks';

    const treeResult = await this.getSubfoldersTree(
      this.sqliteFileName(),
      rootFolderName
    );
    if (treeResult.success) {
      console.log(
        '>===>>  -------- > ',
        rootFolderName,
        ' Folder Tree:',
        treeResult.data
      );
      if (treeResult.data)
        this.treeNodes = mapFolderNodesToTree(treeResult.data);
    }
  }

  async getSubfoldersTree(sqliteFile: string, rootTitle: string) {
    return window.electronAPI.invoke(
      'sqlite:get-subfolders-tree',
      sqliteFile,
      rootTitle
    ) as Promise<{ success: boolean; data?: FolderNode[]; error?: string }>;
  }

  onTreeSelectFolderChange(selectedId: string) {
    this.selectedFolderName = selectedId;
    const result = this.findTreeSelectNodeWithAncestors(
      this.treeNodes,
      selectedId
    );

    if (!result) {
      this.bookmarkFolder = '';
      console.warn('Selected folder not found');
      return;
    }

    const { node, ancestors } = result;
    const selectedNodeTitle = node.title ?? '';
    this.bookmarkFolder = selectedNodeTitle;
    this.selectedfolderNodeId = node.key as unknown as number;
    const ancestorTitles = ancestors.map((a) => a.title).filter(Boolean);
    console.log('Selected folder:', node.title);
    const ansectorsString = ancestorTitles.join(' > ');
    console.log('Ancestor path:', ansectorsString); // or use array directly
    const fsnp =
      ansectorsString.length > 0
        ? ansectorsString + ' > ' + selectedNodeTitle
        : selectedNodeTitle;

    this.fullSelectedNodePathLabel.set(
      'Bookmark Folder Name' + '  (' + fsnp + ')'
    );

    this.getNumberOfUniqueLinksOfFolder(
      this.selectedfolderNodeId
    );
    this.getFolderLinksContentsById(
       this.selectedfolderNodeId
    );

    if (this.fullSelectedNodePathLabel.length > 0) {
      this.importedUrlsArrayString.set('');
      this.scrappedDataArray.set([]);
      this.scrappedDataArrayString.set('');
    }
  }

  

  private async getNumberOfUniqueLinksOfFolder(
    folderId: number
  ) {
    try {
      const result = (await window.electronAPI.invoke(
        'sqlite:get-number-unique-links-from-folder-by-id',
        folderId
      )) as { success: boolean; count?: number; error?: string };

      if (result.success && result.count && result.count > 0) {
        // this.countedUniqueLinks.set(result.count);
        console.log('Number of Unique Links: ', result.count);
        // this.fullSelectedNodePath.set(this.fullSelectedNodePath() + ' ( links: ' + result.count + ')');
        this.imoprtedUrlsLabel.set(
          'Imported URLs ' + ' (links: ' + result.count + ')'
        );
      }
    } catch (err) {
      console.error('IPC open-file-dialog invoke failed:', err);
    }
  }

  private findTreeSelectNodeByKey(
    nodes: NzTreeNodeOptions[],
    key: string
  ): NzTreeNodeOptions | undefined {
    for (const n of nodes) {
      if (n.key === key) return n;
      if (n.children) {
        const child = this.findTreeSelectNodeByKey(n.children, key);
        if (child) return child;
      }
    }
    return undefined;
  }

  private findTreeSelectNodeWithAncestors(
    nodes: NzTreeNodeOptions[],
    key: string,
    path: NzTreeNodeOptions[] = []
  ): { node: NzTreeNodeOptions; ancestors: NzTreeNodeOptions[] } | undefined {
    for (const n of nodes) {
      const newPath = [...path, n];
      if (n.key === key) {
        return { node: n, ancestors: path };
      }
      if (n.children) {
        const result = this.findTreeSelectNodeWithAncestors(
          n.children,
          key,
          newPath
        );
        if (result) return result;
      }
    }
    return undefined;
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

  // onGetBookmarkFolderUrls() {
  //   if (this.bookmarkFolder.length === 0) return;
  //   //this.getContentsFromBookmarksFolder(this.sqliteFileName());
  //   this.getFolderLinksContentsById(this.sqliteFileName());
  // }

  onGetSqliteFile() {
    this.getFileFromElectron().catch((err) =>
      console.error('Unexpected error calling Electron:', err)
    );
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
      const msg: string =
        this.urlsArray().length + ' unique URLs found in total!';
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

  private async getFolderLinksContentsById(folderId: number) {
    // const bookmarksFolderName: string = this.bookmarkFolder; //'Reactive-Material';

    console.log('>===>> Getting contents of folder with ID:', folderId);

    const qRes = (await window.electronAPI.invoke(
      'sqlite:get-folder-contents-by-id',
      folderId
    )) as { success: boolean; data?: any; error?: string };

    if (qRes.success) {
      console.log('>===>> Bookmarks Folder Contents: ', qRes.data);
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

      // // Show message in modal dialog
      // const msg: string =
      //   this.urlsArray().length + ' unique URLs found in total!';
      // this.dlgService
      //   .popup({
      //     token: 'succ',
      //     header: 'URLs Found!',
      //     content: msg,
      //     posAnsMsg: 'OK',
      //     negAnsMsg: '',
      //   })
      //   .subscribe((result) => {
      //     console.log('Dialog closed with:', result);
      //   });
      const lbStringUrls = this.urlsArray().join('\n');
      this.importedUrlsArrayString.set(lbStringUrls);
    } else {
      console.error(
        'IPC sqlite:get-folder-contents - Bookmarks Folder Contents Query failed:',
        qRes.error
      );
    }
  }

  onClearAll() {
    this.scrappedDataArray.set([]); // Clear the Scraped Data array
    this.scrappedDataArrayString.set(''); // Clear the string representation of the Scraped Data array
    this.importedUrlsArrayString.set(''); // Clear the imported URLs
    this.selectedFolderName = '';
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
