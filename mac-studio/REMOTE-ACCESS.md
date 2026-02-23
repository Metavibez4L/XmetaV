# Mac Studio — Remote Access Setup

> **Priority:** 1 (must be done first before any migration)
> **Status:** Planning
> **Last updated:** 2026-02-23
>
> **Network topology:**
> - Mac Studio → **NYC** (always-on, headless server)
> - MacBook Air → **North Carolina** (daily driver, remote control)
> - Same local network **only during initial setup**
> - All ongoing access is **over the internet via Tailscale**

---

## Phase 1: Initial Setup (While on Same Network)

> Do all of this during the one-time physical setup session in NYC before leaving.

### Enable Screen Sharing (for initial setup only)

**On Mac Studio:**
1. `System Settings → General → Sharing → Screen Sharing` → **ON**
2. Note the computer name (e.g., `Mac-Studio.local`)
3. Restrict to your user account only

### Enable SSH

**On Mac Studio:**
1. `System Settings → General → Sharing → Remote Login` → **ON**
2. Allow access for your user account

**Test from Air (while on same network):**
```bash
ssh username@Mac-Studio.local
```

---

## Phase 2: Tailscale (Primary Access — Required)

> **This is how you'll access the Studio from NC after leaving NYC.**
> Tailscale creates an encrypted mesh VPN (WireGuard) — no port forwarding, no static IPs, works from anywhere.

### Install Tailscale (on BOTH machines, during setup)

```bash
# On Mac Studio
brew install tailscale
sudo tailscaled install-system-daemon
tailscale up --ssh  # enables Tailscale SSH (no OpenSSH needed)

# On MacBook Air
brew install tailscale
tailscale up
```

**Both machines sign in with the same Tailscale account.**

### Verify (while on same network)

```bash
# From Air — should see both machines
tailscale status

# Connect via Tailscale hostname (MagicDNS)
ssh username@mac-studio

# Screen Sharing via Tailscale
open vnc://mac-studio
```

### Enable Tailscale Auto-Start (on Mac Studio)

```bash
# Ensure Tailscale starts on boot (critical — you can't fix this remotely if it fails)
sudo tailscale set --auto-update
```

Also: `System Settings → General → Login Items` → add **Tailscale**

---

## Phase 3: SSH Key Setup (Passwordless over Tailscale)

### Generate Key Pair (on MacBook Air)

```bash
# Generate Ed25519 key
ssh-keygen -t ed25519 -C "akualabs@macbook-air" -f ~/.ssh/mac_studio

# Copy public key to Mac Studio (via Tailscale hostname)
ssh-copy-id -i ~/.ssh/mac_studio.pub username@mac-studio
```

### SSH Config (on MacBook Air)

Add to `~/.ssh/config`:
```
Host studio
    HostName mac-studio           # Tailscale MagicDNS name
    User username
    IdentityFile ~/.ssh/mac_studio
    ForwardAgent yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
    # Keep connection alive across network changes
    TCPKeepAlive yes
    ServerAliveCountMax 5
```

Now you can just type:
```bash
ssh studio
```

### Quick-Connect Aliases (on MacBook Air)

Add to `~/.zshrc`:
```bash
# Mac Studio shortcuts (all via Tailscale)
alias studio='ssh studio'
alias studio-screen='open vnc://mac-studio'
alias studio-deploy='ssh studio "cd ~/Documents/XmetaV && git pull && npm run build"'
alias studio-logs='ssh studio "tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log"'
alias studio-status='ssh studio "cd ~/Documents/XmetaV && openclaw health"'
alias studio-x402='ssh studio "curl -s localhost:3001/health | jq"'
```

---

## Phase 4: Expose Services (Tailscale Funnel or Serve)

### Option A: Tailscale Serve (private — only your devices)

Expose x402-server to your Tailscale network only:
```bash
# On Mac Studio
tailscale serve --bg https://localhost:3001  # x402-server
tailscale serve --bg --set-path /dashboard https://localhost:3000  # dashboard
```

Access from Air:
```bash
curl https://mac-studio.tail1234.ts.net/  # x402 API
open https://mac-studio.tail1234.ts.net/dashboard  # dashboard
```

### Option B: Tailscale Funnel (public — for x402 clients)

Expose x402 to the public internet with HTTPS (auto-certs):
```bash
# On Mac Studio — public HTTPS endpoint, no nginx needed
tailscale funnel --bg 3001  # x402-server on https://mac-studio.tail1234.ts.net
```

This gives you:
- Free auto-HTTPS (Let's Encrypt via Tailscale)
- No nginx/Caddy needed
- No port forwarding on NYC router
- Public URL for x402 integrators

### Fallback: Port Forwarding (not recommended)

If Tailscale isn't an option:
1. Need access to NYC router admin
2. Forward port 22 → Mac Studio IP (SSH)
3. Forward port 443 → Mac Studio IP (HTTPS)
4. Requires: static IP or DDNS, firewall rules, fail2ban
5. **Problem:** If ISP changes IP or router reboots, you lose access

---

## Phase 5: Hardening

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

## Execution Plan (One-Time NYC Setup Session)

> **All of this happens while you're physically in NYC with both machines on the same network.**
> After this, you never need physical access to the Studio again.

| Step | Action | Time | Notes |
|------|--------|------|-------|
| 1 | Power on Studio, complete macOS setup | 15 min | Create user account, set hostname |
| 2 | Enable Screen Sharing + Remote Login | 2 min | System Settings → Sharing |
| 3 | Install Homebrew + essentials | 10 min | `node`, `git`, `tailscale` |
| 4 | **Install Tailscale on Studio + sign in** | 5 min | **CRITICAL — this is your lifeline** |
| 5 | Install Tailscale on Air + sign in | 3 min | Same Tailscale account |
| 6 | Verify Tailscale: `ssh username@mac-studio` | 2 min | Test from Air via Tailscale |
| 7 | Generate SSH key + copy to Studio | 3 min | Passwordless access |
| 8 | Add SSH config + aliases on Air | 2 min | `ssh studio` works |
| 9 | Set Tailscale to auto-start on boot | 2 min | Login Items + daemon |
| 10 | Test reboot recovery | 5 min | Reboot Studio, verify reconnect from Air |
| 11 | Harden SSH (disable password auth) | 5 min | Keys only after this |
| 12 | Clone XmetaV repo + install deps | 10 min | Prep for migration |
| 13 | Install Ollama + pull models | 10 min | `kimi-k2.5:cloud` |
| 14 | Install OpenClaw | 5 min | `npm install -g openclaw` |
| 15 | **Final test: disconnect from local network** | 5 min | Connect Air to phone hotspot, verify Tailscale still works |
| **Total** | | **~85 min** | |

---

## Verification Checklist

### During NYC Setup (same network)
- [ ] Screen Sharing connects from Air → Studio (local)
- [ ] SSH connects: `ssh username@Mac-Studio.local`
- [ ] Tailscale installed on both machines
- [ ] Tailscale SSH works: `ssh username@mac-studio`
- [ ] SSH key copied, passwordless login works
- [ ] `ssh studio` alias works
- [ ] Tailscale set to auto-start on boot
- [ ] Studio rebooted — Tailscale reconnects automatically

### Before Leaving NYC (critical!)
- [ ] **Disconnect Air from local network** (use phone hotspot)
- [ ] **Verify `ssh studio` still works over Tailscale** ← DO NOT LEAVE WITHOUT THIS
- [ ] **Verify `open vnc://mac-studio` works over Tailscale**
- [ ] Password auth disabled (keys only)
- [ ] Firewall enabled on Studio
- [ ] Studio plugged into ethernet (not Wi-Fi — more reliable for always-on)
- [ ] Studio set to auto-restart after power failure: `System Settings → Energy → Start up automatically after a power failure`
- [ ] Can run: `ssh studio "openclaw health"`

### After Returning to NC
- [ ] `ssh studio` connects from home
- [ ] `studio-screen` opens Screen Sharing
- [ ] `studio-status` returns health check
- [ ] Full migration can proceed remotely

---

## After Returning to NC — Remote Migration

Once remote access is confirmed from NC, the entire x402 migration runs remotely:

```bash
# From Air in NC — deploy to Studio in NYC
ssh studio << 'EOF'
  cd ~/Documents/XmetaV
  git pull
  cd dashboard && npm install && cd ..
  cd dashboard/bridge && npm install && cd ../..
  cd dashboard/x402-server && npm install && cd ../..
  # Copy .env files (scp from Air)
  # Start services, install plists
  # ... rest of migration from MIGRATION.md
EOF
```

```bash
# Copy env files from Air to Studio
scp dashboard/x402-server/.env studio:~/Documents/XmetaV/dashboard/x402-server/.env
scp dashboard/.env.local studio:~/Documents/XmetaV/dashboard/.env.local
```

```bash
# Expose x402 publicly via Tailscale Funnel
ssh studio "tailscale funnel --bg 3001"
```

This unblocks everything in [MIGRATION.md](MIGRATION.md).

---

## Recovery Plan (If You Lose Access)

| Scenario | Fix |
|----------|-----|
| Tailscale goes offline | Ask someone in NYC to reboot the Studio |
| Studio loses power | Auto-restarts if "Start up after power failure" is ON |
| Studio loses internet | Need physical access or ask NYC contact to check ethernet |
| SSH keys lost | Re-setup from Air (Tailscale still works with password) |
| Tailscale account issue | Contact Tailscale support, or NYC physical access |

**Recommendation:** Have a trusted person in NYC who can:
- Power cycle the Mac Studio if needed
- Plug in ethernet if it gets disconnected
- Confirm the machine has power light on

This is your insurance policy for a headless remote server.
