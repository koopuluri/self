export type Beat = { id: number; text: string; kind: 'text'|'asset'|'chat'|'bubble'|'browser'|'document'; filepath?: string; author: string; createdAt: string|null; completedAt: string|null; updatedAt?: string; deletedAt?: string; redacted?: boolean; imported?: boolean; contextBeatId?: number; source?: { path: string; line: number }; asset?: { name: string; path: string; preview?: string; bytes?: number }; bubble?: { role: string; text: string; source?: string; reaction?: string; failure?: string }; url?: string; chatId?: string; visits?: { enteredAt: string; exitedAt: string|null }[] };
export type Snapshot = { beats: Beat[]; nextId: number; hash: string; retired: Record<number, number|null>; file: string };
export type Chat = { id: string; threadId: string; messages: { role: string; text: string; at: string; source?: string }[]; status: string; liveText?: string; activity?: string; canStop?: boolean };
export type Reply = { value: any; snapshot?: Snapshot };
export type ThreadCard = { unread: boolean; id: string; title: string; summary: string; human_context?: string; humanContextTraceId?: string; state: string; action: string };
export type StreamEvent = { cards?: ThreadCard[]; event: string; source?: number; phase?: 'working' | 'ready' | 'done'; chatId?: string; messageIndex?: number; snapshot?: Snapshot; message?: string; id?: number; chat?: Chat };
declare global {
  interface Window { streamAPI?: {
    call(method: string, args?: any): Promise<Reply>;
    onEvent(callback: (event: StreamEvent) => void): () => void;
    importFiles(files: File[]): Promise<Reply>;
    pickFiles(): Promise<Reply|null>;
    openBrowser(url: string): Promise<Reply>;
    closeReady(): void;
    copyBeatLink(id: number): Promise<void>;
    openAsset(id: number): Promise<string>;
  }; }
}
