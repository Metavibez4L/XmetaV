# Mac Studio — Remote Access Setup

> **Priority:** 1 (must be done first before any migration)
> **Status:** Planning
> **Last updated:** 2026-02-23

---

## Phase 1: Local Network Access

### Screen Sharing (Primary — GUI access)

**On Mac Studio:**
1. `System Settings → General → Sharing → Screen Sharing` → **ON**
2. Note the computer name (e.g., `Mac-Studio.local`)
3. Optionally restrict to your user account only

**From MacBook Air:**
```bash
# Connect via Finder
# Go → Connect to Server → vnc://Mac-Studio.local

# Or from terminal
open vnc://Mac-Studio.local
```

### SSH (Fallback — Terminal access)

**On Mac Studio:**
1. `System Settings → General → Sharing → Remote Login` → **ON**
2. Allow access for your user account

**From MacBook Air:**
```bash
ssh username@Mac-Studio.local
```

---

## Phase 2: SSH Key Setup (Passwordless)

### Generate Key Pair (on MacBook Air)

```bash
# Generate Ed25519 key (most secure, recommended)
ssh-keygen -t ed25519 -C "akualabs@macbook-air" -f ~/.ssh/mac_studio

# Copy public key to Mac Studio
ssh-copy-id -i ~/.ssh/mac_studio.pub username@Mac-Studio.local
```

### SSH Config (on MacBook Air)

Add to `~/.ssh/config`:
```
Host studio
    HostName Mac-Studio.local
    User username
    IdentityFile ~/.ssh/mac_studio
    ForwardAgent yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

Now you can just type:
```bash
ssh studio
```

### Quick-Connect Aliases (on MacBook Air)

Add to `~/.zshrc`:
```bash
# Mac Studio shortcuts
alias studio='ssh studio'
alias studio-screen='open vnc://Mac-Studio.local'
alias studio-deploy='ssh studio "cd ~/Documents/XmetaV && git pull && npm run build"'
alias studio-logs='ssh studio "tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log"'
alias studio-status='ssh studio "cd ~/Documents/XmetaV && openclaw health"'
```

---

## Phase 3: Outside Network Access (Tailscale)

### Why Tailscale
- Zero-config mesh VPN — no port forwarding needed
- Works from anywhere (coffee shop, phone, etc.)
- End-to-end encrypted (WireGuard)
- Free for personal use (up to 100 devices)

### Setup

**On both machines:**
```bash
# Install
brew install tailscale

# Start and authenticate
tailscale up
```

**After setup:**
```bash
# SSH via Tailscale (works from anywhere)
ssh username@mac-studio  # uses Tailscale MagicDNS

# Screen Sharing via Tailscale
open vnc://mac-studio
```

**Update SSH config for Tailscale:**
```
Host studio
    HostName mac-studio  # Tailscale MagicDNS name
    User username
    IdentityFile ~/.ssh/mac_studio
    ForwardAgent yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### Alternative: Port Forwarding (more complex, not recommended)

If Tailscale isn't an option:
1. Router admin → Port forwarding
2. Forward port 22 → Mac Studio IP (SSH)
3. Forward port 5900 → Mac Studio IP (VNC)
4. **Requires:** static IP or DDNS, firewall rules, fail2ban for SSH

---

## Phase 4: Hardening

### SSH Security (on Mac Studio)

Edit `/etc/ssh/sshd_config`:
```
PasswordAuthentication no          # Keys only
PermitRootLogin no                 # No root SSH
MaxAuthTries 3                     # Limit attempts
AllowUsers username                # Whitelist your user
```

Restart SSH:
```bash
sudo launchctl stop com.openssh.sshd
sudo launchctl start com.openssh.sshd
```

### Firewall (on Mac Studio)

```bash
# Enable macOS firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on

# Allow SSH and Screen Sharing (already allowed by Sharing prefs)
# Block everything else inbound
```

### Screen Sharing Security

- Require password (set in Sharing preferences)
- Restrict to specific users
- Consider disabling VNC when not actively using it

---

## Execution Plan

| Step | Action | Time | Prereq |
|------|--------|------|--------|
| 1 | Enable Screen Sharing on Studio | 2 min | Physical access to Studio |
| 2 | Enable Remote Login (SSH) on Studio | 2 min | Physical access to Studio |
| 3 | Test `ssh username@Mac-Studio.local` from Air | 1 min | Steps 1-2 |
| 4 | Generate SSH key pair on Air | 1 min | — |
| 5 | Copy public key to Studio | 1 min | Step 3 |
| 6 | Add SSH config entry on Air | 1 min | Step 4 |
| 7 | Add shell aliases on Air | 1 min | Step 6 |
| 8 | Install Tailscale on both machines | 5 min | — |
| 9 | Harden SSH config on Studio | 5 min | Step 5 |
| 10 | Test everything (local + remote) | 5 min | All above |
| **Total** | | **~25 min** | |

---

## Verification Checklist

- [ ] Screen Sharing connects from Air → Studio
- [ ] SSH connects with `ssh studio` (no password prompt)
- [ ] `studio-status` alias works
- [ ] Tailscale connects from outside local network
- [ ] Password auth disabled (key-only SSH)
- [ ] Firewall enabled on Studio
- [ ] Can run remote commands: `ssh studio "openclaw health"`

---

## After Remote Access is Confirmed

Once remote access is solid, the entire x402 migration can be executed remotely from the MacBook Air:

```bash
# From Air — deploy to Studio
ssh studio << 'EOF'
  cd ~/Documents
  git clone https://github.com/Metavibez4L/XmetaV.git
  cd XmetaV
  npm install
  # ... rest of migration from MIGRATION.md
EOF
```

This unblocks everything in [MIGRATION.md](MIGRATION.md).
