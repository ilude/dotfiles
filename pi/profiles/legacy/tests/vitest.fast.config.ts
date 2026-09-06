import { configDefaults, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";
import { integrationTests } from "./integration-tests.ts";

export default mergeConfig(baseConfig, {
	test: {
		exclude: [...configDefaults.exclude, ...integrationTests],
	},
});
