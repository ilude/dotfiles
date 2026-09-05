export async function unavailable() {
  return import("fixture-dependency-that-is-not-installed");
}
