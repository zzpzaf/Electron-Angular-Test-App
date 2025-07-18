import { Component, signal } from '@angular/core';
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// declare global {
//   interface Window {
//     electronAPI: {
//       readMarkdownFile(fileName: string): string;
//     };
//   }
// }

// declare global {
//   interface Window {
//     electronAPI: {
//       readMarkdownFile(fileName: string): Promise<string>;
//     };
//   }
// }

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {



  public safeHtmlContent = signal<SafeHtml | null>(null);

  constructor(private sanitizer: DomSanitizer) {}
  

  async ngOnInit() {
    console.log('Home component initialized, loading markdown file');
    try {
      const result = await window.electronAPI.invoke('read-markdown', 'home.md');

      if (typeof result === 'string') {

        const rawHtml=  await marked.parse(result);
        const safeHtml = this.sanitizer.bypassSecurityTrustHtml(rawHtml);

        this.safeHtmlContent.set(safeHtml);
      } else {
        console.error('Invalid markdown content received:', result);
      }
    } catch (error) {
      console.error('Error loading markdown file:', error);
    }
  }

}




// Use the electronAPI to read a markdown file
