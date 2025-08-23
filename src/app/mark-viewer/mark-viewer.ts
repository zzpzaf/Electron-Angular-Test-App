import { Component, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
// import { ActivatedRoute } from '@angular/router';
import { PostData } from '../../../shared/projectObjects/varObjects';
import { marked } from 'marked';

@Component({
  selector: 'app-mark-viewer',
  imports: [],
  templateUrl: './mark-viewer.html',
  styleUrl: './mark-viewer.scss'
})
export class MarkViewer {

  // private route = inject(ActivatedRoute);
  public $article = signal<PostData | null>(null);
  public safeHtmlContent = signal<SafeHtml | null>(null);
  private sanitizer = inject(DomSanitizer);

  ngOnInit() {

    // Listen for incoming data sent from Electron main process
    if (window?.electronAPI?.on) {
      window.electronAPI.on('window-data', (data: PostData) => {
        console.log('>===>> 📨 PostData Title received from main process:', data.title);
        this.$article.set(data);
        if (this.$article()?.content) {
          this.parseMarkdownToHtml(this.$article()!.content ?? '');
        }
      });
    }


    // Listen for query parameters attached to the route (if any)
    // *** Using query parameters is not the best practice for large structured or sensitive data
    // this.route.queryParamMap.subscribe((params) => {
    //   const pathQueryData = params.get('data');
    //   if (pathQueryData) {
    //     try {
    //       const postData: PostData = JSON.parse(decodeURIComponent(pathQueryData));
    //       this.$article.set(postData);
    //       if (this.$article()?.content) {
    //         this.parseMarkdownToHtml(this.$article()!.content ?? '');
    //       }
    //     } catch (e) {
    //       console.error('Error! Failed to parse received data:', e);
    //     }
    //   }
    // });
  }

  async parseMarkdownToHtml(markdown: string) {
    const rawHtml = await Promise.resolve(marked.parse(markdown));
    const safeHtml = this.sanitizer.bypassSecurityTrustHtml(rawHtml);
     this.safeHtmlContent.set(safeHtml);
  }


}


