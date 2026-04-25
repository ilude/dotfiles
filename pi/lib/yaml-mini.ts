/**
 * Minimal TS-native YAML loader for Pi extensions.
 *
 * Covers the subset Pi extensions need without spawning a subprocess or
 * pulling in a 50KB+ dependency: top-level mappings, nested mappings,
 * sequences (including sequences of mappings), bare and quoted string
 * scalars, # line comments, and blank lines.
 *
 * Intentionally NOT supported (use loadYamlViaPython from yaml-helpers.ts
 * for these, or accept a Documented Exception for a bespoke parser):
 *   - block scalars (>, |)
 *   - flow style ([a, b, c], {a: 1, b: 2})
 *   - anchors and aliases (&, *, <<)
 *   - explicit document markers (---)
 *   - non-string scalar typing (numbers, bools, dates remain strings)
 *   - tab indentation (use spaces)
 *
 * The loader is strict about indentation: child indent must be strictly
 * greater than parent indent. Mixed tabs/spaces are rejected.
 */

type YamlValue = string | YamlValue[] | { [key: string]: YamlValue };

interface ParsedLine {
	indent: number;
	content: string;
	lineNumber: number;
}

function tokenizeLines(input: string): ParsedLine[] {
	const lines: ParsedLine[] = [];
	const raw = input.split("\n");
	for (let i = 0; i < raw.length; i += 1) {
		const line = raw[i];
		if (line.includes("\t")) {
			throw new Error(`yaml-mini: tab indentation not supported (line ${i + 1})`);
		}
		const trimmed = line.replace(/\s+$/, "");
		const stripped = trimmed.trimStart();
		if (stripped === "" || stripped.startsWith("#")) continue;
		lines.push({
			indent: trimmed.length - stripped.length,
			content: stripped,
			lineNumber: i + 1,
		});
	}
	return lines;
}

function unquoteScalar(value: string): string {
	const trimmed = value.trim();
	if (trimmed === "") return "";
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function parseInlineValue(content: string): { key: string; inlineValue: string | null } {
	const colonIdx = content.indexOf(":");
	if (colonIdx === -1) {
		throw new Error(`yaml-mini: mapping line missing colon: ${content}`);
	}
	const key = content.slice(0, colonIdx).trim();
	const rest = content.slice(colonIdx + 1).trim();
	return { key, inlineValue: rest === "" ? null : rest };
}

function parseBlock(lines: ParsedLine[], start: number, indent: number): { value: YamlValue; next: number } {
	if (start >= lines.length) return { value: "", next: start };

	const first = lines[start];
	if (first.indent < indent) return { value: "", next: start };

	if (first.content.startsWith("- ") || first.content === "-") {
		return parseSequence(lines, start, first.indent);
	}
	return parseMapping(lines, start, first.indent);
}

function parseSequence(lines: ParsedLine[], start: number, indent: number): { value: YamlValue[]; next: number } {
	const items: YamlValue[] = [];
	let i = start;
	while (i < lines.length) {
		const line = lines[i];
		if (line.indent < indent) break;
		if (line.indent > indent) {
			throw new Error(`yaml-mini: unexpected indentation at line ${line.lineNumber}`);
		}
		if (!line.content.startsWith("-")) break;

		const itemContent = line.content.slice(1).trimStart();
		i += 1;

		if (itemContent === "") {
			// Block follows on next line
			const block = parseBlock(lines, i, indent + 1);
			items.push(block.value);
			i = block.next;
			continue;
		}

		// Inline content. Could be a scalar OR the first key of a mapping whose
		// remaining keys are on subsequent lines at indent+2.
		if (itemContent.includes(":")) {
			const { key, inlineValue } = parseInlineValue(itemContent);
			const map: { [k: string]: YamlValue } = {};
			if (inlineValue !== null) {
				map[key] = unquoteScalar(inlineValue);
			} else {
				const child = parseBlock(lines, i, indent + 2);
				map[key] = child.value;
				i = child.next;
			}
			// Continuation lines at indent+2 contributing more keys to this map.
			while (i < lines.length && lines[i].indent === indent + 2 && !lines[i].content.startsWith("-")) {
				const cont = parseInlineValue(lines[i].content);
				i += 1;
				if (cont.inlineValue !== null) {
					map[cont.key] = unquoteScalar(cont.inlineValue);
				} else {
					const child = parseBlock(lines, i, indent + 4);
					map[cont.key] = child.value;
					i = child.next;
				}
			}
			items.push(map);
		} else {
			items.push(unquoteScalar(itemContent));
		}
	}
	return { value: items, next: i };
}

function parseMapping(lines: ParsedLine[], start: number, indent: number): { value: { [k: string]: YamlValue }; next: number } {
	const out: { [k: string]: YamlValue } = {};
	let i = start;
	while (i < lines.length) {
		const line = lines[i];
		if (line.indent < indent) break;
		if (line.indent > indent) {
			throw new Error(`yaml-mini: unexpected indentation at line ${line.lineNumber}`);
		}
		if (line.content.startsWith("-")) break;

		const { key, inlineValue } = parseInlineValue(line.content);
		i += 1;
		if (inlineValue !== null) {
			out[key] = unquoteScalar(inlineValue);
		} else {
			const child = parseBlock(lines, i, indent + 1);
			out[key] = child.value;
			i = child.next;
		}
	}
	return { value: out, next: i };
}

export function parseYamlMini(input: string): YamlValue {
	const lines = tokenizeLines(input);
	if (lines.length === 0) return {};
	const result = parseBlock(lines, 0, lines[0].indent);
	return result.value;
}
