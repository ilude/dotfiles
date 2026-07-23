// Onclave v2 adapter loader: the implementation lives in the onclave
// submodule (~/.dotfiles/onclave), which is the source of truth. Requires
// pnpm install in the submodule. Broker configuration uses the adapter default
// unless Onclave is launched with an explicit override.
//
// The path climbs to $HOME and back down through .dotfiles so it resolves
// both from the real location (~/.dotfiles/pi/extensions) and through the
// ~/.pi/agent symlink (~/.pi/agent/extensions), which pi does not
// canonicalize before resolving imports.
export { default } from "../../../.dotfiles/onclave/extensions/onclave-pi/src/onclave-pi";
