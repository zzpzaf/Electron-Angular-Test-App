export {};

declare global {
  interface Window {
    electronAPI: {
      send(channel: string, data: unknown): void;
      // on(channel: string, callback: (...args: unknown[]) => void): void;
      on(channel: string, callback: (data: any) => void): void;
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    };
  }
}
