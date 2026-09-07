export function curlResponse(url: string, signal: AbortSignal, budgetMs: number, executable?: string): Promise<{
  status: number; ok: boolean; headers: Headers; text: string;
}>;
