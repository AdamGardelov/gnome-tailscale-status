import GLib from 'gi://GLib';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const POLL_INTERVAL_SECONDS = 10;

const TailscaleIndicator = GObject.registerClass(
class TailscaleIndicator extends PanelMenu.Button {
    _init(extensionPath) {
        super._init(0.0, 'Tailscale Status');

        this._extensionPath = extensionPath;

        // Panel icon using custom Tailscale SVG
        this._icon = new St.Icon({
            gicon: this._getIcon('tailscale-connected-symbolic'),
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        // Status label in the dropdown
        this._statusItem = new PopupMenu.PopupMenuItem('Checking...', { reactive: false });
        this.menu.addMenuItem(this._statusItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // IP label in the dropdown (clickable to copy)
        this._ipItem = new PopupMenu.PopupMenuItem('IP: —');
        this._selfIp = null;
        this._ipItem.connect('activate', () => this._copyToClipboard(this._selfIp));
        this.menu.addMenuItem(this._ipItem);

        // Hostname label
        this._hostnameItem = new PopupMenu.PopupMenuItem('Hostname: —', { reactive: false });
        this.menu.addMenuItem(this._hostnameItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Machines section
        this._machinesHeaderItem = new PopupMenu.PopupMenuItem('Machines', { reactive: false });
        this._machinesHeaderItem.label.style = 'font-weight: bold;';
        this.menu.addMenuItem(this._machinesHeaderItem);
        this._peerItems = [];

        this._machinesSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this._machinesSeparator);

        // Toggle connect/disconnect
        this._toggleItem = new PopupMenu.PopupMenuItem('Connect');
        this._toggleItem.connect('activate', () => this._toggleTailscale());
        this.menu.addMenuItem(this._toggleItem);

        // Track state
        this._connected = false;

        // Initial check + start polling
        this._checkStatus();
        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            POLL_INTERVAL_SECONDS,
            () => {
                this._checkStatus();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _getIcon(name) {
        const iconPath = GLib.build_filenamev([this._extensionPath, 'icons', `${name}.svg`]);
        return Gio.icon_new_for_string(iconPath);
    }

    _checkStatus() {
        try {
            const proc = Gio.Subprocess.new(
                ['tailscale', 'status', '--json'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout] = p.communicate_utf8_finish(res);
                    const status = JSON.parse(stdout);

                    const backendState = status.BackendState || 'Unknown';
                    this._connected = backendState === 'Running';

                    if (this._connected) {
                        const selfNode = status.Self || {};
                        const tailIps = selfNode.TailscaleIPs || [];
                        const ipv4 = tailIps.find(ip => !ip.includes(':')) || tailIps[0] || '—';
                        const hostname = selfNode.HostName || '—';

                        this._icon.gicon = this._getIcon('tailscale-connected-symbolic');
                        this._icon.style_class = 'system-status-icon';
                        this._statusItem.label.text = `Status: Connected (${backendState})`;
                        this._selfIp = ipv4;
                        this._ipItem.label.text = `IP: ${ipv4}`;
                        this._hostnameItem.label.text = `Hostname: ${hostname}`;
                        this._toggleItem.label.text = 'Disconnect';

                        this._updatePeers(status.Peer || {});
                    } else {
                        this._icon.gicon = this._getIcon('tailscale-disconnected-symbolic');
                        this._icon.style_class = 'system-status-icon tailscale-disconnected';
                        this._statusItem.label.text = `Status: ${backendState}`;
                        this._selfIp = null;
                        this._ipItem.label.text = 'IP: —';
                        this._hostnameItem.label.text = 'Hostname: —';
                        this._toggleItem.label.text = 'Connect';
                        this._clearPeers();
                    }
                } catch (e) {
                    this._setError('Error parsing status');
                }
            });
        } catch (e) {
            this._setError('tailscale not found');
        }
    }

    _setError(msg) {
        this._connected = false;
        this._icon.gicon = this._getIcon('tailscale-disconnected-symbolic');
        this._icon.style_class = 'system-status-icon tailscale-disconnected';
        this._statusItem.label.text = `Status: ${msg}`;
        this._ipItem.label.text = 'IP: —';
        this._hostnameItem.label.text = 'Hostname: —';
        this._toggleItem.label.text = 'Connect';
        this._clearPeers();
    }

    _clearPeers() {
        for (const item of this._peerItems) {
            item.destroy();
        }
        this._peerItems = [];
    }

    _updatePeers(peers) {
        this._clearPeers();

        const peerList = Object.values(peers).sort((a, b) => {
            if (a.Online !== b.Online) return a.Online ? -1 : 1;
            return (a.HostName || '').localeCompare(b.HostName || '');
        });

        for (const peer of peerList) {
            const hostname = peer.HostName || 'unknown';
            const tailIps = peer.TailscaleIPs || [];
            const ipv4 = tailIps.find(ip => !ip.includes(':')) || '—';
            const os = peer.OS || '';
            const online = peer.Online ? '●' : '○';

            const label = `${online}  ${hostname} — ${ipv4}${os ? ` (${os})` : ''}`;
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => this._copyToClipboard(ipv4));
            if (!peer.Online) {
                item.label.style = 'color: #888;';
            }

            // Insert before the machines separator
            this.menu.addMenuItem(item, this._getMenuPosition(this._machinesSeparator));
            this._peerItems.push(item);
        }
    }

    _copyToClipboard(text) {
        if (!text || text === '—') return;
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
        Main.notify('Tailscale', `Copied ${text} to clipboard`);
    }

    _getMenuPosition(item) {
        const items = this.menu._getMenuItems();
        for (let i = 0; i < items.length; i++) {
            if (items[i] === item) return i;
        }
        return -1;
    }

    _toggleTailscale() {
        const cmd = this._connected ? 'down' : 'up';
        try {
            Gio.Subprocess.new(
                ['pkexec', 'tailscale', cmd],
                Gio.SubprocessFlags.NONE
            );
            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
                this._checkStatus();
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            log(`Tailscale toggle error: ${e.message}`);
        }
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        super.destroy();
    }
});

export default class TailscaleStatusExtension extends Extension {
    enable() {
        this._indicator = new TailscaleIndicator(this.path);
        Main.panel.addToStatusArea('tailscale-status', this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
