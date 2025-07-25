import { Injectable } from '@angular/core';

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

  getPropertyValueBySubstring(key: string, substring: string): Promise<string> {
    return this.ipcInvoke<string>('get-property-by-substring', key, substring);
  }

  // Generic invoke wrapper (helper function) to avoid repeating 
  // the '... as Promise<string>' adition in return commands, everywhere
  //-------------------------------------------------------------------------
  // function ipcInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  //   return window.electronAPI.invoke(channel, ...args) as Promise<T>;
  // }
  private ipcInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    return window.electronAPI.invoke(channel, ...args) as Promise<T>;
  }
}
