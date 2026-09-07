export function classifyUrl(value: string): Promise<{
  parsed: URL; privateOrLocal: boolean; addresses: Array<{ address: string; family: number }>;
}>;
