# Tailscale Status for GNOME Shell

A GNOME Shell extension that shows your Tailscale VPN status in the top panel.

## Features

- Panel icon showing connection status (connected/disconnected)
- Your Tailscale IP and hostname
- List of all machines on your tailnet with online/offline status
- Click any IP address to copy it to clipboard
- Connect/disconnect toggle

## Requirements

- GNOME Shell 45, 46, 47, or 48
- [Tailscale](https://tailscale.com/) installed and available in PATH

## Installation

### Manual

```bash
git clone https://github.com/AdamGardelov/gnome-tailscale-status.git
cp -r gnome-tailscale-status ~/.local/share/gnome-shell/extensions/tailscale-status@gardelov.com
```

Then restart GNOME Shell:
- **Wayland:** Log out and back in
- **X11:** Press `Alt+F2`, type `r`, press Enter

Enable the extension:
```bash
gnome-extensions enable tailscale-status@gardelov.com
```

## License

GPL-2.0-or-later
