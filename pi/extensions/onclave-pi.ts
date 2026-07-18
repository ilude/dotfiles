// Onclave v2 adapter loader: the implementation lives in the onclave
// submodule (~/.dotfiles/onclave), which is the source of truth. Requires
// pnpm install in the submodule and ONCLAVE_AMQP_URL in the environment
// (set via ~/.dotfiles/.env).
export { default } from "../../onclave/extensions/onclave-pi/src/onclave-pi";
