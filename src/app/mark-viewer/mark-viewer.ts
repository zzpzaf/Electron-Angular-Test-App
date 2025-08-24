import { Component, inject, signal } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
// import { ActivatedRoute } from '@angular/router';
import { PostData } from '../../../shared/projectObjects/varObjects';
import { marked } from 'marked';
import { Markshow } from '../shared/services/markshow';

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
  // private sanitizer = inject(DomSanitizer);
  private markedService = inject(Markshow);

  ngOnInit() {

    // Listen for incoming data sent from Electron main process
    if (window?.electronAPI?.on) {
      window.electronAPI.on('window-data', (data: PostData) => {
        console.log('>===>> 📨 PostData Title received from main process:', data.title);
        this.$article.set(data);
        if (this.$article()?.content) {
          // this.parseMarkdownToHtml(this.$article()!.content ?? '');
          const safeHtml = this.markedService.render(this.$article()!.content ?? '');
          this.safeHtmlContent.set(safeHtml);
        }
      });
    }

  }

  // async parseMarkdownToHtml(markdown: string) {
  //   const rawHtml = await Promise.resolve(marked.parse(markdown));
  //   const safeHtml = this.sanitizer.bypassSecurityTrustHtml(rawHtml);
  //    this.safeHtmlContent.set(safeHtml);
  // }


}


