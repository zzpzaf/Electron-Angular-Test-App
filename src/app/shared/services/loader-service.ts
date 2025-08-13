// app/shared/services/loader-service.ts

// Tracks concurrent operations and exposes an observable you can bind to.
// This service is used by the global loader component to show/hide loading indicators.
// It uses Angular's signal system for reactivity.
// The loader can be shown with a custom tip message, and it supports parallel operations.

import { Injectable, computed, signal } from '@angular/core';

@Injectable({ 
  providedIn: 'root' 
})
export class LoaderService {
  private activeCount = signal(0);
  readonly isLoading = computed(() => this.activeCount() > 0);

  /**
   * Show the loader. Returns a disposer you can call to hide.
   * Safe for overlapping/parallel operations.
   */
  show(tip?: string): () => void {
    this.activeCount.update((n) => n + 1);
    if (tip !== undefined) this.setTip(tip);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.hide();
      if (tip !== undefined) this.clearTip();
    };
  }

  hide(): void {
    this.activeCount.update((n) => Math.max(0, n - 1));
  }

  // Optional tip text
  private _tip = signal<string | null>(null);
  readonly tip = computed(() => this._tip());

  setTip(text: string) {
    this._tip.set(text);
  }
  clearTip() {
    this._tip.set(null);
  }

  /** Helper for ergonomics */
  async withLoader<T>(fn: () => Promise<T>, tip?: string): Promise<T> {
    const done = this.show(tip);
    try {
      return await fn();
    } finally {
      done();
    }
  }

  /** Emergency reset */
  reset(): void {
    this.activeCount.set(0);
    this.clearTip();
  }
}
