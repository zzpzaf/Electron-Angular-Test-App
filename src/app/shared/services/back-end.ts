import { Injectable } from '@angular/core';


interface DeleteFilesResult {
  deleted: string[];
  failed: string[];
}


@Injectable({
  providedIn: 'root',
})
export class BackEnd {
  // getPropertyValueBySubstring(key: string, substring: string): Promise<string> {
  //   return window.electronAPI.invoke(
  //     'config:getPropertyBySubstring',
  //     key,
  //     substring
  //   ) as Promise<string>;
  // }



  // Generic invoke wrapper (helper function) to avoid repeating
  // the '... as Promise<string>' adition in return commands, everywhere
  //-------------------------------------------------------------------------
  // function ipcInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  //   return window.electronAPI.invoke(channel, ...args) as Promise<T>;
  // }
  private ipcInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    return window.electronAPI.invoke(channel, ...args) as Promise<T>;
  }


  copyFile(source: string, destination: string): Promise<{ success: boolean }> {
    return this.ipcInvoke<{success: boolean }>('copy-file', source, destination);
  }

  copyMultiFiles(sourceFilePaths: string[], destinationFolder: string): Promise<{ success: boolean }> {
    return this.ipcInvoke<{success: boolean }>('copy-wild-files', sourceFilePaths, destinationFolder);
  }

  deleteFiles(filePaths: string[]): Promise<DeleteFilesResult> {
    return this.ipcInvoke<DeleteFilesResult>('delete-files', filePaths);
  }



  /**
   * Copy the original places.sqlite database to a backup location.
   * @param sourcePath Path to the original places.sqlite file
   * @param targetPath Path to the backup file location
   */
  // copyOrgPlacesSQLite(sourcePath: string, targetPath: string) {
  //   return this.ipcInvoke<{ success: boolean; message?: string; error?: string }>(
  //     'sqlite:backup-places',
  //     sourcePath,
  //     targetPath
  //   );
  // }

 

  getPropertyValueBySubstring(key: string, substring: string): Promise<string> {
    return this.ipcInvoke<string>('get-property-by-substring', key, substring);
  }

  getPropertyValueByKey(key: string): Promise<string | null> {
    const result = this.ipcInvoke<string>('get-config-property-by-key', key);
    return result;
  }



  quitApp() {
    return this.ipcInvoke('app:quit');
  }
}
