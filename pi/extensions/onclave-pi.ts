// Onclave v2 adapter loader: the implementation lives in the onclave
// submodule (~/.dotfiles/onclave), which is the source of truth. Requires
// pnpm install in the submodule. The adapter loads ONCLAVE_API_BASE from
// Bitwarden Secrets Manager and connects over signed HTTPS using ~/.ssh/id_ed25519.
//
// The path climbs to $HOME and back down through .dotfiles so it resolves
// both from the real location (~/.dotfiles/pi/extensions) and through the
// ~/.pi/agent symlink (~/.pi/agent/extensions), which pi does not
// canonicalize before resolving imports.
export { default } from "../../../.dotfiles/onclave/extensions/onclave-pi/src/onclave-pi";
