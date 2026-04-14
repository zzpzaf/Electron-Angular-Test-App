export {};

declare global {
  interface Window {
    electronAPI: {
      // Send a one-way message to the main process
      send(channel: string, data: unknown): void;
      // Listen for messages from the main process
      on(channel: string, callback: (data: any) => void): void;
      // Remove all listeners registered for a channel
      removeAllListeners(channel: string): void;
      // Invoke an IPC method and await a result from the main process
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;
      // Open a new window from Angular (if exposed in preload.ts)
      openWindow?(data: any): void;
    };
  }
}
