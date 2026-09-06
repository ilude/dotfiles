import { id } from "../src/api.js";

const value: string = id("ok");
// @ts-expect-error numbers are not part of the public contract
id(42);
void value;
