# Arch Linux + Niri Desktop Setup Checklist

## Goals

- Desktop Linux environment for development with OpenCode
- Modern Wayland compositor (Niri) for efficient workflow
- Minimal, fast, keyboard-driven setup

## Hardware

- **Device**: KAMRUI Mini PC (Amazon)
- **CPU**: AMD Ryzen 5 7430U (6C/12T, up to 4.3GHz)
- **RAM**: 32GB DDR4
- **Storage**: 512GB NVMe SSD (expandable to 4TB)
- **GPU**: AMD Radeon Vega 8 Graphics
- **Connectivity**: WiFi 6, BT5.2, Triple Display (HDMI + DP + USB-C)

## Software Stack

- **OS**: Arch Linux (rolling, cutting-edge packages)
- **Compositor**: Niri (scrollable-tiling Wayland)
- **Terminal**: Wezterm (GPU-accelerated)
- **Shell**: Zsh + Oh My Zsh + tmux
- **Runtime**: Bun (JavaScript/TypeScript)
- **Editor**: OpenCode (AI) + Zed (primary, VS Code-like)
- **File Manager**: Yazi (TUI)
- **Launcher**: Wofi
- **Bar**: Waybar
- **Screenshots**: Grim + Slurp
- **Notifications**: Mako

## Why This Stack

- User knows Ubuntu Server (not desktop Linux)
- Niri chosen for modern Wayland + scrollable tiling
- Avoided NixOS (too complex for primary desktop use)
- Arch chosen for package freshness and AUR

## User Requirements

- **Languages**: Python, Golang, TypeScript
- **Container**: Docker
- **Apps**: Spotify, Brave browser
- **Workflow**: Workspaces + terminal-heavy
- **Display**: Single ultrawide 34" monitor
- **Sync**: Syncthing + Tailscale (existing infrastructure)
- **Security**: No LUKS needed

## Pre-Installation

- [ ] Download Arch ISO from https://archlinux.org/download/
- [ ] Create bootable USB with `dd if=archlinux.iso of=/dev/sdX bs=4M status=progress`
- [ ] Verify internet connection (wired preferred for install)
- [ ] Note: UEFI, secure boot - disable in BIOS/UEFI

## Base System Install

- [ ] Set keyboard layout: `loadkeys us`
- [ ] Verify boot mode: `ls /sys/firmware/efi/efivars` (must exist)
- [ ] Update system clock: `timedatectl set-ntp true`
- [ ] Partition disk:
  - [ ] `/boot/efi` - 512MB, FAT32, flags: esp, boot
  - [ ] `swap` - 8GB (or RAM size)
  - [ ] `/` - rest of disk, btrfs or ext4
- [ ] Format partitions:
  - [ ] `mkfs.fat -F32 /dev/sda1`
  - [ ] `mkswap /dev/sda2`
  - [ ] `mkfs.btrfs -L arch /dev/sda3` or `mkfs.ext4 /dev/sda3`
- [ ] Mount partitions:
  - [ ] `mount /dev/sda3 /mnt`
  - [ ] `mount --mkdir /dev/sda1 /mnt/boot/efi`
  - [ ] `swapon /dev/sda2`
- [ ] Install base packages: `pacstrap -K /mnt base base-devel linux linux-firmware sudo git`
- [ ] Generate fstab: `genfstab -U /mnt >> /mnt/etc/fstab`
- [ ] Chroot into system: `arch-chroot /mnt`
- [ ] Set timezone: `ln -sf /usr/share/zoneinfo/Region/City /etc/localtime`
- [ ] Sync hardware clock: `hwclock --systohc`
- [ ] Set locale: uncomment `en_US.UTF-8` in `/etc/locale.gen`, then `locale-gen`
- [ ] Create `/etc/locale.conf`: `LANG=en_US.UTF-8`
- [ ] Set hostname: create `/etc/hostname` with your hostname
- [ ] Set root password: `passwd`
- [ ] Install bootloader (systemd-boot):
  - [ ] `bootctl install`
  - [ ] Create `/boot/loader/entries/arch.conf`:
    ```
    title   Arch Linux
    linux   /vmlinuz-linux
    initrd  /initramfs-linux.img
    options root=/dev/sda3 rw
    ```
- [ ] Exit chroot: `exit`
- [ ] Reboot: `reboot`

## Post-Base Install (First Boot)

- [ ] Create user: `useradd -m -G wheel username`
- [ ] Set user password: `passwd username`
- [ ] Enable sudo for wheel group: uncomment `%wheel ALL=(ALL) ALL` in `/etc/sudoers`
- [ ] Update system: `sudo pacman -Syu`
- [ ] Install SSH: `sudo pacman -S openssh`
- [ ] Enable SSH: `sudo systemctl enable sshd`

## Desktop Environment: Niri

- [ ] Install GPU drivers:
  - [ ] AMD: `sudo pacman -S mesa xf86-video-amdgpu vulkan-radeon`
  - [ ] Intel: `sudo pacman -S mesa xf86-video-intel intel-media-driver`
- [ ] Install Wayland: `sudo pacman -S wayland`
- [ ] Install Niri dependencies:
  - [ ] `sudo pacman -S seatd libinput libdisplay-info libcolorpicker libwallpaper`
- [ ] Install build tools: `sudo pacman -S cargo meson ninja`
- [ ] Clone and build Niri:
  - [ ] `git clone https://github.com/YaLTeR/niri.git`
  - [ ] `cd niri && cargo build --release`
  - [ ] `sudo cp target/release/niri /usr/local/bin/`
- [ ] Create Niri session file `/usr/share/wayland-sessions/niri.desktop`:
  ```
  [Desktop Entry]
  Name=Niri
  Comment=Scrollable-tiling Wayland compositor
  Exec=niri
  Type=Application
  ```
- [ ] Configure Niri for 9 workspaces:
  - Edit `~/.config/niri/config.kdl`
  - Add workspace bindings:
    ```
    binds {
        Super+1 workspace 1
        Super+2 workspace 2
        Super+3 workspace 3
        Super+4 workspace 4
        Super+5 workspace 5
        Super+6 workspace 6
        Super+7 workspace 7
        Super+8 workspace 8
        Super+9 workspace 9
        
        Super+Shift+1 move-to-workspace 1
        Super+Shift+2 move-to-workspace 2
        Super+Shift+3 move-to-workspace 3
        Super+Shift+4 move-to-workspace 4
        Super+Shift+5 move-to-workspace 5
        Super+Shift+6 move-to-workspace 6
        Super+Shift+7 move-to-workspace 7
        Super+Shift+8 move-to-workspace 8
        Super+Shift+9 move-to-workspace 9
    }
    ```

### Workspace Layout Strategy

Each workspace is a self-contained project environment:
```
WS1: project-a/ (git worktree)
     - Terminal → cd project-a
     - Yazi → ~/projects/project-a
     - Browser → localhost:3000 or project docs

WS2: project-b/
     ...
```

This means each workspace always has: terminal, file manager, browser.
Super+1-9 switches which project you're working on.

## Essential Wayland Stack

- [ ] Terminal: `sudo pacman -S wezterm`
- [ ] Launcher: `sudo pacman -S wofi`
- [ ] Notifications: `sudo pacman -S mako`
- [ ] Bar: `sudo pacman -S waybar`
- [ ] Screenshots: `sudo pacman -S grim slurp`
- [ ] Clipboard: `sudo pacman -S wl-clipboard`
- [ ] Color picker: `sudo pacman -S hyprpicker`

## Development Tools

- [ ] Install Git: `sudo pacman -S git`
- [ ] Install Zsh: `sudo pacman -S zsh`
- [ ] Set zsh as default: `chsh -s /bin/zsh`
- [ ] Install Oh My Zsh: `sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"`
- [ ] Install tmux: `sudo pacman -S tmux`

### Language Runtimes

- [ ] Python: `sudo pacman -S python python-pip`
- [ ] Go: `sudo pacman -S go`
- [ ] Bun: `curl -fsSL https://bun.sh/install | bash`
- [ ] Add bun to PATH in ~/.zshrc

### Docker

- [ ] Install Docker: `sudo pacman -S docker`
- [ ] Enable Docker: `sudo systemctl enable docker`
- [ ] Add user to docker group: `sudo usermod -aG docker $USER`
- [ ] Install Docker Compose v2: `sudo pacman -S docker-compose`
- [ ] Start Docker: `sudo systemctl start docker`
- [ ] Verify: `docker ps`

### Per-Project Docker Workflow

Each workspace/project may have its own containers:
- `docker compose up -d` in project directory
- Use `docker compose logs -f` in terminal for each project
- Consider Portainer or Dockge for GUI management (optional)

### Desktop Apps

- [ ] Install Brave: `yay -S brave` (requires AUR/yay)
- [ ] Install Spotify: `yay -S spotify`
- [ ] Install Discord (optional): `yay -S discord`

### Editor

- [ ] Install OpenCode (for AI interaction):
  - [ ] Download from https://opencode.ai
  - [ ] `sudo cp opencode /usr/local/bin/`
  - [ ] `sudo chmod +x /usr/local/bin/opencode`
- [ ] Install Zed (primary editor - VS Code alternative):
  - [ ] `yay -S zed`
  - [ ] Launch once to generate config: `zed --version`
  - [ ] Configure keybindings if desired
- [ ] (Optional) Install Neovim with LazyVim for VS Code-like experience:
  - [ ] `yay -S neovim`
  - [ ] See `.specs/arch-install/neovim-setup.md` for LazyVim config

## File Management

- [ ] Install Yazi: `sudo pacman -S yazi`
- [ ] Install fzf: `sudo pacman -S fzf`
- [ ] Install unzip: `sudo pacman -S unzip`

## Audio

- [ ] Install PipeWire: `sudo pacman -S pipewire wireplumber`
- [ ] Enable PipeWire: `systemctl --user enable pipewire.service`
- [ ] Install volume control: `sudo pacman -S pavucontrol`

## Fonts

- [ ] Install fonts: `sudo pacman -S noto-fonts noto-fonts-cjk jetbrains-mono-fonts`
- [ ] Configure fontconfig if needed

## Optional: Gaming (if needed)

- [ ] Install Mesa drivers for gaming
- [ ] Install Steam: `sudo pacman -S steam`
- [ ] Enable multilib: uncomment `[multilib]` in `/etc/pacman.conf`

## Dotfiles & Configuration

- [ ] Clone dotfiles: `git clone https://github.com/yourusername/dotfiles.git ~/.dotfiles`
- [ ] Symlink configs as needed
- [ ] Configure Niri: `~/.config/niri/config.kdl`
  - Note: Niri uses scrollable tiling - windows flow horizontally in each workspace
  - Configure 9 workspaces: `Super+1` through `Super+9` to switch
- [ ] Configure Waybar: `~/.config/waybar/config`
  - Enable workspaces module (shows all 9 workspaces, highlights active)
  - Place at top of screen (KDE3-style full-width bar)
  - Include: workspaces | cpu/memory | volume | wifi | clock
- [ ] Configure Wezterm: `~/.config/wezterm/wezterm.lua`
- [ ] Configure keybinds (workspace-focused):
  ```
  Super+1-9     → Switch to workspace 1-9
  Super+Shift+1-9 → Move window to workspace 1-9
  Super+Tab     → Cycle workspaces
  ```

## First Niri Session Checklist

- [ ] Login to graphical session (Niri from display manager or startx)
- [ ] Test screenshot hotkey (grim + slurp)
- [ ] Test launcher (wofi)
- [ ] Test notifications (mako)
- [ ] Test terminal (wezterm)
- [ ] Verify internet (wifi/ethernet)
- [ ] Verify audio

## Post-Setup

- [ ] Enable automatic updates or set up manual update routine
- [ ] Install AUR helper (yay): `git clone https://aur.archlinux.org/yay.git && cd yay && makepkg -si`
- [ ] Install additional packages as needed

### Sync & Network (User Infrastructure)

- [ ] Install Tailscale:
  - [ ] `yay -S tailscale`
  - [ ] Enable: `sudo systemctl enable --now tailscaled`
  - [ ] Connect: `sudo tailscale up`
- [ ] Install Syncthing:
  - [ ] `yay -S syncthing`
  - [ ] Enable: `sudo systemctl enable --now syncthing@$USER`
  - [ ] Configure: access via http://localhost:8384

## Troubleshooting Commands

```bash
# Check Niri logs
journalctl -xe -b | grep niri

# Check Wayland session
echo $WAYLAND_DISPLAY

# Check GPU
lspci | grep -i vga

# Check dmesg for errors
dmesg | grep -i error
```

## Time Estimate

- Base install: 30-45 min
- Desktop setup: 1-2 hours
- Dotfile config: varies
- Total: 2-4 hours
