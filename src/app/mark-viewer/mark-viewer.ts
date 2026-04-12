import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeHtml } from '@angular/platform-browser';
import { PostData } from '../../../shared/projectObjects/varObjects';
import { Markshow } from '../shared/services/markshow';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';

@Component({
  selector: 'app-mark-viewer',
  imports: [
    CommonModule,
    NzButtonModule,
    NzIconModule,
    NzCollapseModule,
    NzModalModule,
  ],
  templateUrl: './mark-viewer.html',
  styleUrl: './mark-viewer.scss'
})
export class MarkViewer {

  public $article = signal<PostData | null>(null);
  public safeHtmlContent = signal<SafeHtml | null>(null);

  // Edit mode state for markdown-only editing
  public $isEditMode = signal(false);
  public $markdownDraft = signal('');

  // Navigation history: articles received during this window's lifetime
  private articleHistory = signal<PostData[]>([]);
  public $historyIndex = signal<number>(-1);

  public $canGoPrev = computed(() => this.$historyIndex() > 0);
  public $canGoNext = computed(() => this.$historyIndex() < this.articleHistory().length - 1);

  // Collapse: tracks which panels are open (nzActive binding uses string[])
  public $metaExpanded = signal(false);

  private markedService = inject(Markshow);
  private modalService = inject(NzModalService);

  // Stores an incoming article while a save/discard dialog is in progress
  private $pendingArticle = signal<PostData | null>(null);

  ngOnInit() {
    if (window?.electronAPI?.on) {
      window.electronAPI.on('window-data', (data: PostData) => {
        console.log('>===>> 📨 PostData Title received from main process:', data.title);

        if (this.$isEditMode() && this.hasUnsavedChanges()) {
          this.$pendingArticle.set(data);
          this.showUnsavedChangesDialog();
          return;
        }

        const next = [...this.articleHistory(), data];
        this.articleHistory.set(next);
        this.$historyIndex.set(next.length - 1);
        this.$isEditMode.set(false);
        this.renderArticle(data);
      });
    }
  }

  private renderArticle(data: PostData): void {
    this.$article.set(data);
    this.$markdownDraft.set(data.content ?? '');
    if (data.content) {
      this.safeHtmlContent.set(this.markedService.render(data.content));
    } else {
      this.safeHtmlContent.set(null);
    }
  }

  onPrevArticle(): void {
    const idx = this.$historyIndex() - 1;
    if (idx < 0) return;
    this.$historyIndex.set(idx);
    this.renderArticle(this.articleHistory()[idx]);
  }

  onNextArticle(): void {
    const idx = this.$historyIndex() + 1;
    if (idx >= this.articleHistory().length) return;
    this.$historyIndex.set(idx);
    this.renderArticle(this.articleHistory()[idx]);
  }

  onShellClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    const raw = anchor.getAttribute('href') ?? '';

    // Fragment-only links (#section) scroll within the page — let them through.
    if (raw.startsWith('#')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const url = this.resolveArticleUrl(raw);
    if (url) {
      void window.electronAPI.invoke('open-external-url', url);
    }
  }

  /**
   * Resolves any href value to a full URL for shell.openExternal.
   * Handles absolute, protocol-relative, and root-relative paths (e.g. /@user/article)
   * by resolving against the current article's own origin.
   */
  private resolveArticleUrl(raw: string): string | null {
    // Already an absolute URL with a recognised scheme
    if (/^(https?:|mailto:|tel:)/i.test(raw)) {
      return raw;
    }
    // Protocol-relative: //example.com/path
    if (raw.startsWith('//')) {
      return 'https:' + raw;
    }
    // Root-relative (/path), query-relative (?x=y), or bare relative path —
    // resolve against the article's original URL so the correct host is used.
    const articleLink = this.$article()?.link ?? '';
    if (!articleLink) {
      return null;
    }
    try {
      return new URL(raw, articleLink).href;
    } catch {
      return null;
    }
  }

  onMarkdownInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }
    this.$markdownDraft.set(target.value);
  }

  onEdit(): void {
    const article = this.$article();
    if (!article) {
      return;
    }
    this.$markdownDraft.set(article.content ?? '');
    this.$isEditMode.set(true);
  }

  onCancel(): void {
    this.$markdownDraft.set(this.$article()?.content ?? '');
    this.$isEditMode.set(false);
  }

  onUpdate(): void {
    if (!this.$isEditMode()) {
      return;
    }
    this.applyUpdate();
  }

  private applyUpdate(): void {
    const article = this.$article();
    const idx = this.$historyIndex();
    if (!article || idx < 0) {
      return;
    }

    const updatedContent = this.$markdownDraft();
    const updatedArticle: PostData = {
      ...article,
      content: updatedContent,
    };

    const history = [...this.articleHistory()];
    history[idx] = updatedArticle;
    this.articleHistory.set(history);

    this.renderArticle(updatedArticle);
    this.$isEditMode.set(false);
  }

  private hasUnsavedChanges(): boolean {
    return this.$markdownDraft() !== (this.$article()?.content ?? '');
  }

  private loadPendingArticle(): void {
    const pending = this.$pendingArticle();
    if (!pending) {
      return;
    }
    this.$pendingArticle.set(null);
    const next = [...this.articleHistory(), pending];
    this.articleHistory.set(next);
    this.$historyIndex.set(next.length - 1);
    this.$isEditMode.set(false);
    this.renderArticle(pending);
  }

  private showUnsavedChangesDialog(): void {
    const modal = this.modalService.create({
      nzTitle: 'Unsaved Changes',
      nzContent: 'The current article has unsaved changes. What would you like to do with them?',
      nzClosable: false,
      nzMaskClosable: false,
      nzFooter: [
        {
          label: 'Save Changes',
          type: 'primary',
          onClick: () => {
            this.applyUpdate();
            this.loadPendingArticle();
            modal.destroy();
          },
        },
        {
          label: 'Discard Changes',
          danger: true,
          onClick: () => {
            this.loadPendingArticle();
            modal.destroy();
          },
        },
        {
          label: 'Cancel',
          onClick: () => {
            this.$pendingArticle.set(null);
            modal.destroy();
          },
        },
      ],
    });
  }

}



