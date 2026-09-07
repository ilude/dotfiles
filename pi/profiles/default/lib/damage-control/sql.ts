// SQL console arguments execute code, unlike quoted shell/search data. Mask
// ordinary SQL literals/comments before applying the retained statement rules.
// Procedural dollar quoting remains unresolved rather than guessed safe.
export function sqlExecutableText(source: string, dialect: string): string | undefined {
  let result = "";
  for (let i = 0; i < source.length;) {
    const mysql = ["mysql", "mariadb"].includes(dialect);
    if ((source.startsWith("--", i) && (!mysql || /\s/.test(source[i + 2] ?? " "))) || (mysql && source[i] === "#")) {
      while (i < source.length && source[i] !== "\n") i++;
      result += " "; continue;
    }
    if (source.startsWith("/*!", i) || source.startsWith("/*M!", i)) return;
    if (source.startsWith("/*", i)) {
      let depth = 1; i += 2;
      while (i < source.length && depth) {
        if (source.startsWith("/*", i)) return; // Engines disagree about nested comments.
        else if (source.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) return;
      result += " "; continue;
    }
    if (source[i] === "$" && /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(source.slice(i))) return;
    const quote = source[i];
    if (["'", '"', "`"].includes(quote)) {
      i++; let closed = false;
      while (i < source.length) {
        if (source[i] === "\\") return; // Session SQL modes change backslash semantics.
        if (source[i] === quote) {
          if (source[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) return;
      result += " literal "; continue;
    }
    result += source[i++];
  }
  return result;
}
