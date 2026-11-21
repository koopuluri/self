export type Beat = { id: number; text: string; kind: 'text'|'asset'|'chat'|'browser'; author: string; createdAt: string|null; completedAt: string|null; updatedAt?: string; deletedAt?: string; redacted?: boolean; imported?: boolean; contextBeatId?: number; source?: { path: string; line: number }; asset?: { name: string; path: string; preview?: string; bytes?: number }; url?: string; chatId?: string; visits?: { enteredAt: string; exitedAt: string|null }[] };
export type Snapshot = { beats: Beat[]; nextId: number; file: string };
export type Chat = { id: string; threadId: string; messages: { role: string; text: string; at: string }[]; status: string; draft?: string };
export type Reply = { value: any; snapshot?: Snapshot };
export type StreamEvent = { event: string; snapshot?: Snapshot; message?: string; id?: number; chatId?: string };
declare global {
  interface Window { streamAPI?: {
    call(method: string, args?: any): Promise<Reply>;
    onEvent(callback: (event: StreamEvent) => void): () => void;
    importFiles(files: File[]): Promise<Reply>;
    pickFiles(): Promise<Reply|null>;
    openBrowser(url: string): Promise<Reply>;
    browserBounds(value: any): void;
    hideBrowser(): void;
    closeReady(): void;
    openAsset(id: number): Promise<string>;
    importNotes(): Promise<Reply>;
  }; }
}
