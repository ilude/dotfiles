const FAMILY = /(?:^|[-.])(astra|sol|terra|luna|fable|opus|sonnet|haiku)(?:[-.]|$)/;

export function modelFamilyVersion(id: string): { family: string; version: number[] } | undefined {
  const family = id.match(FAMILY)?.[1];
  if (!family) return undefined;
  const prefix = id.slice(0, id.indexOf(family));
  const versionText = family === "astra" || family === "sol" || family === "terra" || family === "luna"
    ? prefix.match(/gpt-(\d+(?:\.\d+)?)-$/)?.[1]
    : id.slice(id.indexOf(family) + family.length).match(/^-(\d+(?:-\d+)*)/)?.[1]?.replaceAll("-", ".");
  if (!versionText) return undefined;
  return { family, version: versionText.split(".").map(Number) };
}

export function compareModelVersions(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}
