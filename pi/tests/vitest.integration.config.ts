import { mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";
import { integrationTests } from "./integration-tests.ts";

const config = mergeConfig(baseConfig, {
	test: {
		maxWorkers: 2,
	},
});

if (!config.test) config.test = {};
config.test.include = [...integrationTests];

export default config;
