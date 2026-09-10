import { describe, expect, it } from "vitest";
import { CommandInvocationAuthority } from "../lib/command-invocations.ts";

const tools = new Map([["commit", new Set(["commit_run"])]]);

function bind(authority: CommandInvocationAuthority, id: string) {
	authority.bindToolCall(id, "commit_run", "commit", tools);
	return authority.getToolCall(id);
}

describe("command invocation authority", () => {
	it.each([
		["bare then push", false, true],
		["push then bare", true, false],
	])("keeps %s options immutable across delivery", (_label, firstPush, secondPush) => {
		const authority = new CommandInvocationAuthority();
		const first = authority.create("commit", { push: firstPush });
		const second = authority.create("commit", { push: secondPush });
		authority.deliver({ invocationId: first.id });
		const firstCall = bind(authority, "first-call")!;
		authority.deliver({ invocationId: second.id });
		const secondCall = bind(authority, "second-call")!;

		expect(firstCall.options.push).toBe(firstPush);
		expect(secondCall.options.push).toBe(secondPush);
		expect(firstCall).not.toBe(secondCall);
		expect(Object.isFrozen(firstCall)).toBe(true);
		expect(Object.isFrozen(firstCall.options)).toBe(true);
	});

	it("does not trust arbitrary or restored message details", () => {
		const authority = new CommandInvocationAuthority();
		const invocation = authority.create("commit", { push: true });
		expect(authority.deliver({ invocationId: "commit-from-history" })).toBe(false);
		expect(authority.deliver({ invocationId: invocation.id })).toBe(true);
		expect(() => authority.bindToolCall("wrong-tool", "commit_run", "bro", tools)).toThrow();
	});

	it("releases call bindings and clears all authority at settlement", () => {
		const authority = new CommandInvocationAuthority();
		const invocation = authority.create("commit", { push: false });
		authority.deliver({ invocationId: invocation.id });
		bind(authority, "call");
		authority.releaseToolCall("call");
		expect(authority.getToolCall("call")).toBeUndefined();
		authority.settle();
		expect(authority.getToolCall("call")).toBeUndefined();
		expect(() => authority.bindToolCall("after-settle", "commit_run", "commit", tools)).toThrow();
	});
});
