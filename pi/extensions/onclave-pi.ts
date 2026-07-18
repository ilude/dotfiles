// Onclave v2 adapter loader: the implementation lives in the onclave
// submodule (~/.dotfiles/onclave), which is the source of truth. Requires
// pnpm install in the submodule and ONCLAVE_AMQP_URL in the environment
// (set via ~/.dotfiles/private/secrets.env).
//
// The path climbs to $HOME and back down through .dotfiles so it resolves
// both from the real location (~/.dotfiles/pi/extensions) and through the
// ~/.pi/agent symlink (~/.pi/agent/extensions), which pi does not
// canonicalize before resolving imports.
export { default } from "../../../.dotfiles/onclave/extensions/onclave-pi/src/onclave-pi";
