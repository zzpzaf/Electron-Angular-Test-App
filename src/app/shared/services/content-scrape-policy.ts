import { Injectable, computed, signal } from '@angular/core';
import { ScrapeTabsOptions } from '../../../../shared/projectObjects/varObjects';

export interface ContentScrapeHostnameSummary {
  total: number;
  mediumHostnameMatches: number;
  nonMediumHostnameCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class ContentScrapePolicy {
  private readonly _restrictContentToMediumLike = signal<boolean>(true);
  private readonly _mediumHostnameSubstring = signal<string>('medium');
  private readonly _lastHostnameSummary = signal<ContentScrapeHostnameSummary>({
    total: 0,
    mediumHostnameMatches: 0,
    nonMediumHostnameCount: 0,
  });

  readonly restrictContentToMediumLike = computed(() =>
    this._restrictContentToMediumLike()
  );

  readonly mediumHostnameSubstring = computed(() => this._mediumHostnameSubstring());

  readonly lastHostnameSummary = computed(() => this._lastHostnameSummary());

  setRestrictContentToMediumLike(value: boolean): void {
    this._restrictContentToMediumLike.set(!!value);
  }

  isMediumHostname(url: string): boolean {
    const probe = this._mediumHostnameSubstring().toLowerCase().trim();
    if (!probe) {
      return false;
    }

    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname.includes(probe);
    } catch {
      return false;
    }
  }

  summarizeUrls(urls: string[]): ContentScrapeHostnameSummary {
    const normalizedUrls = (urls ?? [])
      .map((url) => (url ?? '').trim())
      .filter((url) => url.length > 0);

    let mediumHostnameMatches = 0;
    for (const url of normalizedUrls) {
      if (this.isMediumHostname(url)) {
        mediumHostnameMatches++;
      }
    }

    const summary: ContentScrapeHostnameSummary = {
      total: normalizedUrls.length,
      mediumHostnameMatches,
      nonMediumHostnameCount: normalizedUrls.length - mediumHostnameMatches,
    };

    this._lastHostnameSummary.set(summary);
    return summary;
  }

  buildScrapeTabsOptions(urls: string[]): ScrapeTabsOptions {
    this.summarizeUrls(urls);

    return {
      restrictContentToMediumLike: this._restrictContentToMediumLike(),
      mediumHostnameSubstring: this._mediumHostnameSubstring().trim().toLowerCase() || 'medium',
    };
  }
}
