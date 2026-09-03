import fs from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import sharp from "sharp";
import { Type, type TSchema } from "typebox";

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_INPUT_PIXELS = 64 * 1024 * 1024;
const MAX_INPUT_DIMENSION = 32768;
const MAX_OUTPUT_PIXELS = 64 * 1024 * 1024;
const MAX_OUTPUT_DIMENSION = 16384;
const TEMPORARY_PREFIX = ".pi-image-";
const ROTATIONS = [0, 90, 180, 270] as const;
const OUTPUT_FORMATS = ["jpeg", "png", "webp"] as const;
const ROTATION_SCHEMA = Type.Union([
	Type.Literal(0),
	Type.Literal(90),
	Type.Literal(180),
	Type.Literal(270),
]);

const OUTPUT_INTEGER = { minimum: 1, maximum: MAX_OUTPUT_DIMENSION } as const;
const INPUT_POSITION = { minimum: 0, maximum: MAX_INPUT_DIMENSION } as const;
const INPUT_SIZE = { minimum: 1, maximum: MAX_INPUT_DIMENSION } as const;

const cropSchema = Type.Object(
	{
		left: Type.Integer(INPUT_POSITION),
		top: Type.Integer(INPUT_POSITION),
		width: Type.Integer(INPUT_SIZE),
		height: Type.Integer(INPUT_SIZE),
	},
	{ additionalProperties: false },
);

const resizeSchema = Type.Object(
	{ width: Type.Integer(OUTPUT_INTEGER), height: Type.Integer(OUTPUT_INTEGER) },
	{ additionalProperties: false },
);

const transformBaseProperties = {
	source: Type.String(),
	destination: Type.String(),
	crop: Type.Optional(cropSchema),
	resize: Type.Optional(resizeSchema),
};

function transformVariant(
	orientation: Record<string, TSchema>,
	encoding: Record<string, TSchema>,
) {
	return Type.Object(
		{ ...transformBaseProperties, ...orientation, ...encoding },
		{ additionalProperties: false },
	);
}

const imageTransformSchema = Type.Union([
	transformVariant({}, {}),
	transformVariant({}, { format: StringEnum(OUTPUT_FORMATS), quality: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }),
	transformVariant({ auto_orient: Type.Literal(true) }, {}),
	transformVariant({ auto_orient: Type.Literal(true) }, { format: StringEnum(OUTPUT_FORMATS), quality: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }),
	transformVariant({ rotate: ROTATION_SCHEMA }, {}),
	transformVariant({ rotate: ROTATION_SCHEMA }, { format: StringEnum(OUTPUT_FORMATS), quality: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }),
]);

interface ImageMetadata {
	width: number;
	height: number;
	format?: string;
	pages?: number;
	channels?: number;
	space?: string;
	depth?: string;
	orientation?: number;
}

interface Crop {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface Resize {
	width: number;
	height: number;
}

interface TransformParams {
	source: string;
	destination: string;
	crop?: Crop;
	resize?: Resize;
	auto_orient?: boolean;
	rotate?: number;
	format?: string;
	quality?: number;
}

function resolveRequestedPath(value: string, cwd: string): string {
	if (value.includes("\0")) throw new Error("Image paths cannot contain NUL bytes");
	const unprefixed = value.startsWith("@") ? value.slice(1) : value;
	if (!unprefixed) throw new Error("Image path is required");
	return path.resolve(cwd, unprefixed);
}

function samePath(left: string, right: string): boolean {
	const normalizedLeft = path.normalize(left);
	const normalizedRight = path.normalize(right);
	return process.platform === "win32"
		? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
		: normalizedLeft === normalizedRight;
}

async function lstatIfPresent(file: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | undefined> {
	try {
		return await fs.lstat(file);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

async function canonicalSource(requested: string): Promise<string> {
	const stat = await fs.stat(requested);
	if (!stat.isFile()) throw new Error("Image source must be a regular file");
	return fs.realpath(requested);
}

async function canonicalDestination(requested: string): Promise<string> {
	if (await lstatIfPresent(requested)) throw new Error("Image destination already exists");

	let ancestor = path.dirname(requested);
	while (true) {
		const stat = await lstatIfPresent(ancestor);
		if (stat) {
			let ancestorStat: Awaited<ReturnType<typeof fs.stat>>;
			try {
				ancestorStat = await fs.stat(ancestor);
			} catch {
				throw new Error("Image destination has an unsafe ancestor");
			}
			if (!ancestorStat.isDirectory()) throw new Error("Image destination parent must be a directory");
			const realAncestor = await fs.realpath(ancestor);
			const suffix = path.relative(ancestor, requested);
			const suffixParts = suffix.split(/[\\/]/);
			if (!suffix || suffixParts.some((part) => !part || part === "." || part === ".."))
				throw new Error("Image destination has an unsafe suffix");
			const destination = path.resolve(realAncestor, ...suffixParts);
			if (path.basename(destination).startsWith(TEMPORARY_PREFIX))
				throw new Error("Image destination has an unsafe suffix");
			if (await lstatIfPresent(destination)) throw new Error("Image destination already exists");
			return destination;
		}
		const parent = path.dirname(ancestor);
		if (parent === ancestor) throw new Error("Image destination has no existing ancestor");
		ancestor = parent;
	}
}

async function readStableBuffer(source: string): Promise<Buffer> {
	const handle = await fs.open(source, "r");
	try {
		const before = await handle.stat();
		if (before.size > MAX_BYTES) throw new Error("Image source exceeds the 100 MiB limit");
		if (!Number.isSafeInteger(before.size)) throw new Error("Image source size is invalid");
		const buffer = Buffer.alloc(before.size);
		let offset = 0;
		while (offset < buffer.length) {
			const result = await handle.read(buffer, offset, buffer.length - offset, offset);
			offset += result.bytesRead;
			if (result.bytesRead === 0) break;
		}
		const after = await handle.stat();
		if (offset !== buffer.length || buffer.length !== before.size || after.size !== before.size)
			throw new Error("Image source changed while it was being read");
		return buffer;
	} finally {
		await handle.close();
	}
}

async function readImage(source: string): Promise<{ buffer: Buffer; metadata: ImageMetadata }> {
	const buffer = await readStableBuffer(source);
	if (buffer.length > MAX_BYTES) throw new Error("Image source exceeds the 100 MiB limit");
	const metadata = (await sharp(buffer, { limitInputPixels: false, animated: false }).metadata()) as ImageMetadata;
	if (!metadata.width || !metadata.height) throw new Error("Image dimensions are unavailable");
	if (metadata.width > MAX_INPUT_DIMENSION || metadata.height > MAX_INPUT_DIMENSION)
		throw new Error("Image dimensions exceed the input limit");
	if (metadata.width * metadata.height > MAX_INPUT_PIXELS)
		throw new Error("Image pixels exceed the input limit");
	if ((metadata.pages ?? 1) !== 1) throw new Error("Animated or multi-page images are not supported");
	return { buffer, metadata };
}

function validateInteger(value: number, minimum: number, maximum: number, label: string): void {
	if (!Number.isInteger(value) || value < minimum || value > maximum)
		throw new Error(`${label} is outside the supported range`);
}

function validateCrop(crop: Crop, width: number, height: number): void {
	validateInteger(crop.left, 0, MAX_INPUT_DIMENSION, "Crop left");
	validateInteger(crop.top, 0, MAX_INPUT_DIMENSION, "Crop top");
	validateInteger(crop.width, 1, MAX_INPUT_DIMENSION, "Crop width");
	validateInteger(crop.height, 1, MAX_INPUT_DIMENSION, "Crop height");
	if (crop.left + crop.width > width || crop.top + crop.height > height)
		throw new Error("Crop must stay within the image bounds");
}

function dimensionsAfterRotation(metadata: ImageMetadata, params: TransformParams): { width: number; height: number } {
	const explicitQuarterTurn = params.rotate === 90 || params.rotate === 270;
	const metadataQuarterTurn = Boolean(
		params.auto_orient && metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8,
	);
	return explicitQuarterTurn !== metadataQuarterTurn
		? { width: metadata.height, height: metadata.width }
		: { width: metadata.width, height: metadata.height };
}

function validateOutput(width: number, height: number): void {
	validateInteger(width, 1, MAX_OUTPUT_DIMENSION, "Output width");
	validateInteger(height, 1, MAX_OUTPUT_DIMENSION, "Output height");
	if (width * height > MAX_OUTPUT_PIXELS) throw new Error("Output pixels exceed the limit");
}

async function inspectImage(sourceValue: string, cwd: string) {
	const source = await canonicalSource(resolveRequestedPath(sourceValue, cwd));
	const { metadata } = await readImage(source);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(metadata) }],
		details: metadata,
	};
}

async function transformImage(params: TransformParams, signal: AbortSignal | undefined, cwd: string) {
	if (params.auto_orient === false) throw new Error("Auto-orient must be true when provided");
	if (params.auto_orient && params.rotate !== undefined)
		throw new Error("Auto-orient and explicit rotation cannot be combined");
	if (params.quality !== undefined && !params.format)
		throw new Error("Quality requires an output format");
	if (params.rotate !== undefined && !ROTATIONS.includes(params.rotate as (typeof ROTATIONS)[number]))
		throw new Error("Rotation must be 0, 90, 180, or 270 degrees");
	if (params.format !== undefined && !OUTPUT_FORMATS.includes(params.format as (typeof OUTPUT_FORMATS)[number]))
		throw new Error("Output format must be jpeg, png, or webp");
	if (params.quality !== undefined) validateInteger(params.quality, 1, 100, "Quality");
	if (!params.crop && !params.resize && !params.auto_orient && params.rotate === undefined && !params.format)
		throw new Error("At least one image operation is required");
	const source = await canonicalSource(resolveRequestedPath(params.source, cwd));
	const destination = await canonicalDestination(resolveRequestedPath(params.destination, cwd));
	if (samePath(source, destination)) throw new Error("Image source and destination must differ");

	return withFileMutationQueue(destination, async () => {
		if (await lstatIfPresent(destination)) throw new Error("Image destination already exists");
		if (signal?.aborted) throw new Error("Image transform aborted");
		const { buffer, metadata } = await readImage(source);
		if (signal?.aborted) throw new Error("Image transform aborted");

		let image = sharp(buffer, { limitInputPixels: false, animated: false });
		if (params.auto_orient) image = image.rotate();
		else if (params.rotate !== undefined) image = image.rotate(params.rotate);
		if (params.crop) {
			const dimensions = dimensionsAfterRotation(metadata, params);
			validateCrop(params.crop, dimensions.width, dimensions.height);
			image = image.extract(params.crop);
		}
		if (params.resize) {
			validateOutput(params.resize.width, params.resize.height);
			image = image.resize(params.resize.width, params.resize.height, { fit: "fill" });
		}
		if (params.format === "jpeg") image = image.jpeg({ quality: params.quality });
		else if (params.format === "png") image = image.png({ quality: params.quality });
		else if (params.format === "webp") image = image.webp({ quality: params.quality });

		const output = await image.toBuffer();
		if (output.length > MAX_BYTES) throw new Error("Image output exceeds the 100 MiB limit");
		const verified = await sharp(output, { limitInputPixels: false, animated: false }).metadata();
		if (!verified.width || !verified.height || !verified.format)
			throw new Error("Transformed image could not be verified");
		validateOutput(verified.width, verified.height);
		if ((verified.pages ?? 1) !== 1) throw new Error("Transformed image is animated or multi-page");

		const temporary = path.join(
			path.dirname(destination),
			`${TEMPORARY_PREFIX}${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		);
		try {
			const handle = await fs.open(temporary, "wx", 0o600);
			try {
				const written = await handle.write(output, 0, output.length, 0);
				if (written.bytesWritten !== output.length) throw new Error("Image output was partially written");
			} finally {
				await handle.close();
			}
			const writtenBuffer = await fs.readFile(temporary);
			if (writtenBuffer.length !== output.length)
				throw new Error("Image output was partially written");
			const reopened = await sharp(writtenBuffer, { limitInputPixels: false, animated: false }).metadata();
			const expectedFormat = params.format ?? verified.format;
			if (reopened.width !== verified.width || reopened.height !== verified.height || (reopened.pages ?? 1) !== 1)
				throw new Error("Transformed image verification changed");
			if (reopened.format !== expectedFormat)
				throw new Error("Transformed image format verification changed");
			if (reopened.exif || reopened.xmp || reopened.iptc || reopened.icc || reopened.orientation !== undefined)
				throw new Error("Transformed image metadata was not stripped");
			if (signal?.aborted) throw new Error("Image transform aborted");
			await fs.link(temporary, destination);
			return {
				content: [{ type: "text" as const, text: `${destination}: ${reopened.width}x${reopened.height} ${reopened.format}` }],
				details: { path: destination, width: reopened.width, height: reopened.height, format: reopened.format },
			};
		} finally {
			await fs.rm(temporary, { force: true });
		}
	});
}

export default function registerImageTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "image_inspect",
		label: "Inspect Image",
		description: "Inspect local image metadata and image properties for crop, resize, rotate, convert, and compress operations without changing it.",
		promptSnippet: "Inspect local image properties before crop, resize, rotate, convert, or compress",
		parameters: Type.Object({ source: Type.String() }, { additionalProperties: false }),
		execute(_id, params, _signal, _onUpdate, ctx) {
			return inspectImage(params.source, ctx.cwd ?? process.cwd());
		},
	});
	pi.registerTool({
		name: "image_transform",
		label: "Transform Image",
		description: "Safely crop, resize, rotate, convert, or compress a local image with metadata stripped by default.",
		promptSnippet: "Crop, resize, rotate, convert, or compress a local image",
		parameters: imageTransformSchema,
		execute(_id, params, signal, _onUpdate, ctx) {
			return transformImage(params, signal, ctx.cwd ?? process.cwd());
		},
	});
}

export {
	inspectImage,
	transformImage,
	canonicalSource,
	canonicalDestination,
	MAX_BYTES,
	MAX_INPUT_PIXELS,
	MAX_OUTPUT_PIXELS,
};
