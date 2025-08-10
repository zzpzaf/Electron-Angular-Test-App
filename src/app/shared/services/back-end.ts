import { Injectable } from '@angular/core';
import { PostData } from '../../../../shared/projectObjects/varObjects';

interface DeleteFilesResult {
  deleted: string[];
  failed: string[];
}

@Injectable({
  providedIn: 'root',
})
export class BackEnd {

  // Generic invoke wrapper (helper function) to avoid repeating
  // the '... as Promise<string>' adition in return commands, everywhere
  //-------------------------------------------------------------------------
  private ipcInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    return window.electronAPI.invoke(channel, ...args) as Promise<T>;
  }


  /*
  * File System Handling functions
  * These functions are used to interact with the file system, such as copying files,
  * deleting files, and application main settings.
  * 
  */

  copyFile(source: string, destination: string): Promise<{ success: boolean }> {
    return this.ipcInvoke<{ success: boolean }>(
      'copy-file',
      source,
      destination
    );
  }

  copyMultiFiles(
    sourceFilePaths: string[],
    destinationFolder: string
  ): Promise<{ success: boolean }> {
    return this.ipcInvoke<{ success: boolean }>(
      'copy-wild-files',
      sourceFilePaths,
      destinationFolder
    );
  }

  deleteFiles(filePaths: string[]): Promise<DeleteFilesResult> {
    return this.ipcInvoke<DeleteFilesResult>('delete-files', filePaths);
  }

  closeDbConnections(): Promise<{ success: boolean; error?: string }> {
    return this.ipcInvoke<{ success: boolean; error?: string }>(
      'sqlite:close-db-connections'
    );
  }

  getPropertyValueBySubstring(key: string, substring: string): Promise<string> {
    return this.ipcInvoke<string>('get-property-by-substring', key, substring);
  }

  getPropertyValueByKey(key: string): Promise<string | null> {
    const result = this.ipcInvoke<string>('get-config-property-by-key', key);
    return result;
  }






  
  /*
  * Main Database Handling functions
  * These functions are used to interact with the main database,
  */

  insertArticles(posts: PostData[]): Promise<number> {
    return this.ipcInvoke<number>('sqlite:insert-articles-from-json-array', posts);
  }

  checkUrlExists(link: string): Promise<boolean> {
    return this.ipcInvoke<boolean>('sqlite:check-if-url-existing', link);
  }







  /*
  * Application wide functions
  */
  quitApp() {
    return this.ipcInvoke('app:quit');
  }
}
