import { appendFileSync } from "node:fs";
const sentinel = process.argv[2];
process.on("SIGTERM", () => process.exit(0));
setInterval(() => appendFileSync(sentinel, `${process.pid}\n`), 50);
