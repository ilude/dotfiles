import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Value } from "typebox/value";
import sharp from "sharp";
import imageTools, { inspectImage, transformImage } from "../extensions/image-tools.js";
import { createMockPi } from "./helpers/mock-pi.js";

const temporaryDirectories: string[] = [];
const TEMPORARY_PREFIX = ".pi-image-";

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
	);
});

async function fixture(options: { oriented?: boolean } = {}): Promise<string> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pi-image-tools-"));
	temporaryDirectories.push(directory);
	const source = path.join(directory, options.oriented ? "oriented.jpg" : "source.png");
	let image = sharp({
		create: { width: 8, height: 6, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
	});
	if (options.oriented) {
		await image
			.withMetadata({ orientation: 6, exif: { IFD0: { Artist: "fixture" } } })
			.jpeg()
			.toFile(source);
	} else {
		await image.withMetadata({ exif: { IFD0: { Artist: "fixture" } } }).png().toFile(source);
	}
	return source;
}

async function tempArtifacts(directory: string): Promise<string[]> {
	return (await fs.readdir(directory)).filter((name) => name.startsWith(TEMPORARY_PREFIX));
}

async function expectMissing(file: string): Promise<void> {
	expect(await fs.stat(file).catch(() => undefined)).toBeUndefined();
}

describe("image tools", () => {
	it("registers both tools and rejects failures instead of returning error results", async () => {
		const pi = createMockPi();
		imageTools(pi as Parameters<typeof imageTools>[0]);
		const inspect = pi._getTool("image_inspect");
		const transform = pi._getTool("image_transform");
		expect(inspect).toBeDefined();
		expect(transform).toBeDefined();
		for (const term of ["crop", "resize", "rotate", "convert", "compress", "metadata", "image"]) {
			expect(inspect.description.toLowerCase()).toContain(term);
			expect(transform.description.toLowerCase()).toContain(term);
		}
		expect(transform.parameters.type).toBe("object");
		await expect(inspect.execute("id", { source: "missing.png" }, undefined, undefined, { cwd: os.tmpdir() })).rejects.toThrow();
		await expect(transform.execute("id", { source: "missing.png", destination: "out.png" }, undefined, undefined, { cwd: os.tmpdir() })).rejects.toThrow("operation");
		for (const input of [
			{ source: "x", destination: "y", unknown: true },
			{ source: "x", destination: "y", rotate: 45 },
			{ source: "x", destination: "y", format: "gif" },
			{ source: "x", destination: "y", quality: 0 },
			{ source: "x", destination: "y", quality: 101 },
			{ source: "x", destination: "y", auto_orient: false, crop: { left: 0, top: 0, width: 1, height: 1 } },
		])
			expect(Value.Check(transform.parameters, input)).toBe(false);
		expect(Value.Check(transform.parameters, { source: "x", destination: "y", rotate: 90, format: "webp", quality: 80 })).toBe(true);
		await expect(transform.execute("id", { source: "x", destination: "y", quality: 80 }, undefined, undefined, { cwd: os.tmpdir() })).rejects.toThrow("Quality requires");
		await expect(transform.execute("id", { source: "x", destination: "y", auto_orient: true, rotate: 90 }, undefined, undefined, { cwd: os.tmpdir() })).rejects.toThrow("cannot be combined");
	});

	it("inspects known metadata and strips covered metadata from transformed output", async () => {
		const source = await fixture();
		const destination = path.join(path.dirname(source), "output.png");
		const result = await inspectImage(source, path.dirname(source));
		expect(result.details).toMatchObject({ width: 8, height: 6, format: "png" });
		await transformImage({ source, destination, resize: { width: 4, height: 3 } }, undefined, path.dirname(source));
		const metadata = await sharp(destination).metadata();
		expect(metadata).toMatchObject({ width: 4, height: 3, format: "png" });
		expect(metadata.exif).toBeUndefined();
		expect(metadata.xmp).toBeUndefined();
		expect(metadata.iptc).toBeUndefined();
		expect(metadata.icc).toBeUndefined();
		expect(metadata.orientation).toBeUndefined();
	});

	it("auto-orients pixels and supports @-prefixed relative paths", async () => {
		const source = await fixture({ oriented: true });
		const directory = path.dirname(source);
		const destination = path.join(directory, "oriented-output.jpg");
		const result = await transformImage(
			{ source: `@${path.basename(source)}`, destination: `@${path.basename(destination)}`, auto_orient: true },
			undefined,
			directory,
		);
		expect(result.details).toMatchObject({ width: 6, height: 8, format: "jpeg" });
		expect((await sharp(destination).metadata()).orientation).toBeUndefined();
	});

	it("rotates and converts to JPEG, PNG, and WebP with bounded quality", async () => {
		const source = await fixture();
		const directory = path.dirname(source);
		for (const [format, extension] of [["jpeg", "jpg"], ["png", "png"], ["webp", "webp"]] as const) {
			const destination = path.join(directory, `converted.${extension}`);
			await transformImage({ source, destination, rotate: 90, format, quality: 80 }, undefined, directory);
			expect(await sharp(await fs.readFile(destination)).metadata()).toMatchObject({ format, width: 6, height: 8 });
		}
		for (const [rotate, width, height] of [[0, 8, 6], [90, 6, 8], [180, 8, 6], [270, 6, 8]] as const) {
			const destination = path.join(directory, `rotated-${rotate}.png`);
			await transformImage({ source, destination, rotate }, undefined, directory);
			expect(await sharp(await fs.readFile(destination)).metadata()).toMatchObject({ width, height });
		}
		for (const rotate of [90, 270] as const) {
			const destination = path.join(directory, `post-rotation-crop-${rotate}.png`);
			await transformImage({ source, destination, rotate, crop: { left: 5, top: 7, width: 1, height: 1 } }, undefined, directory);
			expect(await sharp(await fs.readFile(destination)).metadata()).toMatchObject({ width: 1, height: 1 });
		}
		const orientedSource = await fixture({ oriented: true });
		const orientedDestination = path.join(directory, "post-orientation-crop.jpg");
		await transformImage({ source: orientedSource, destination: orientedDestination, auto_orient: true, crop: { left: 5, top: 7, width: 1, height: 1 } }, undefined, directory);
		expect(await sharp(await fs.readFile(orientedDestination)).metadata()).toMatchObject({ width: 1, height: 1 });
		await expect(transformImage({ source, destination: path.join(directory, "incompatible.png"), auto_orient: true, rotate: 90 }, undefined, directory)).rejects.toThrow("combined");
		await expect(transformImage({ source, destination: path.join(directory, "missing-quality.png"), quality: 80 }, undefined, directory)).rejects.toThrow("requires");
	});

	it("crops and resizes without changing the source or overwriting a destination", async () => {
		const source = await fixture();
		const destination = path.join(path.dirname(source), "output.png");
		const before = await fs.readFile(source);
		const result = await transformImage(
			{ source, destination, crop: { left: 0, top: 1, width: 4, height: 3 }, resize: { width: 2, height: 2 } },
			undefined,
			path.dirname(source),
		);
		expect(result.details).toMatchObject({ width: 2, height: 2, format: "png" });
		expect(await fs.readFile(source)).toEqual(before);
		expect((await sharp(destination).metadata()).width).toBe(2);
		await expect(transformImage({ source, destination, resize: { width: 1, height: 1 } }, undefined, path.dirname(source))).rejects.toThrow("already exists");
	});

	it("accepts benign source and destination ancestor aliases", async () => {
		const source = await fixture();
		const directory = path.dirname(source);
		const sourceAlias = path.join(directory, "source-alias.png");
		const outputAliasDirectory = path.join(directory, "output-alias");
		await fs.symlink(source, sourceAlias, "file");
		await fs.symlink(directory, outputAliasDirectory, process.platform === "win32" ? "junction" : "dir");
		const destination = path.join(outputAliasDirectory, "output.png");
		await transformImage({ source: sourceAlias, destination, resize: { width: 2, height: 2 } }, undefined, directory);
		expect((await sharp(path.join(directory, "output.png")).metadata()).width).toBe(2);
	});

	it("rejects malformed, animated, over-limit, aliased, and out-of-bounds inputs", async () => {
		const source = await fixture();
		const directory = path.dirname(source);
		const malformed = path.join(directory, "malformed.png");
		await fs.writeFile(malformed, "not an image");
		await expect(transformImage({ source: malformed, destination: path.join(directory, "malformed-out.png"), resize: { width: 1, height: 1 } }, undefined, directory)).rejects.toThrow();
		await expectMissing(path.join(directory, "malformed-out.png"));

		const animated = path.join(directory, "animated.gif");
		const animatedBuffer = Buffer.from(
			"47494638396101000100800000000000ffffff21ff0b4e45545343415045322e30030100000021f90400000000002c000000000100010000020244010021f90400000000002c00000000010001000002024401003b",
			"hex",
		);
		await fs.writeFile(animated, animatedBuffer);
		await expect(inspectImage(animated, directory)).rejects.toThrow("multi-page");

		const overLimit = path.join(directory, "over-limit.png");
		await sharp({ create: { width: 8193, height: 8193, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toFile(overLimit);
		await expect(inspectImage(overLimit, directory)).rejects.toThrow("pixels");

		await expect(transformImage({ source, destination: path.join(directory, "bounds.png"), crop: { left: 7, top: 0, width: 2, height: 2 } }, undefined, directory)).rejects.toThrow("bounds");
		await expect(transformImage({ source, destination: path.join(directory, "output-limit.png"), resize: { width: 16385, height: 1 } }, undefined, directory)).rejects.toThrow("range");
		await expect(transformImage({ source, destination: path.join(directory, "pixel-limit.png"), resize: { width: 16384, height: 4097 } }, undefined, directory)).rejects.toThrow("pixels");
		await expect(transformImage({ source, destination: source, resize: { width: 1, height: 1 } }, undefined, directory)).rejects.toThrow();
		const sourceAlias = path.join(directory, "same-source.png");
		await fs.symlink(source, sourceAlias, "file");
		await expect(transformImage({ source, destination: sourceAlias, resize: { width: 1, height: 1 } }, undefined, directory)).rejects.toThrow("already exists");
		await expectMissing(path.join(directory, "bounds.png"));
	});

	it("cancels immediately before publication and leaves no temporary artifact", async () => {
		const source = await fixture();
		const directory = path.dirname(source);
		const destination = path.join(directory, "cancelled.png");
		const controller = new AbortController();
		let checks = 0;
		const signal = {
			get aborted() {
				checks += 1;
				if (checks === 3) controller.abort();
				return controller.signal.aborted;
			},
		} as AbortSignal;
		await expect(transformImage({ source, destination, resize: { width: 2, height: 2 } }, signal, directory)).rejects.toThrow("aborted");
		await expectMissing(destination);
		expect(await tempArtifacts(directory)).toEqual([]);
	});

	it("publishes concurrently without allowing one call to overwrite the other", async () => {
		const source = await fixture();
		const directory = path.dirname(source);
		const destination = path.join(directory, "concurrent.png");
		const results = await Promise.allSettled([
			transformImage({ source, destination, resize: { width: 2, height: 2 } }, undefined, directory),
			transformImage({ source, destination, resize: { width: 3, height: 3 } }, undefined, directory),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
		expect([2, 3]).toContain((await sharp(destination).metadata()).width);
		expect(await tempArtifacts(directory)).toEqual([]);
	});
});
