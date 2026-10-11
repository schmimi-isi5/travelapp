export const PIXABAY_LICENSE: { type: string; licenseUrl: string };
export function createPixabayClient(options: { apiKey: string; userAgent: string; fetchImpl?: typeof fetch; delayMs?: number; sleep?: (ms: number) => Promise<void> }): {
  search(query: string, limit?: number): Promise<unknown[]>;
  download(url: string): Promise<Buffer>;
};
