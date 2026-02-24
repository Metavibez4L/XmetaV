# Tailscale Setup — MacBook Air ↔ Mac Studio

> **Purpose:** Encrypted mesh VPN between NC (Air) and NYC (Studio)
> **Last updated:** 2026-02-24
> **Time needed:** ~15 min (both machines)

---

## Prerequisites

- Both machines powered on and connected to internet
- Homebrew installed on both
- One Tailscale account (free tier supports up to 100 devices)

---

## Step 1: Create Tailscale Account

1. Go to [https://login.tailscale.com](https://login.tailscale.com)
2. Sign up with GitHub, Google, or email
3. Remember which provider you used — both machines must sign in the same way

---

## Step 2: Install on Mac Studio (NYC)

```bash
# Install
brew install tailscale

# Install system daemon (starts on boot)
sudo tailscaled install-system-daemon

# Authenticate — opens browser to sign in
tailscale up --ssh

# Verify
tailscale status
```

The `--ssh` flag enables Tailscale SSH (encrypted SSH without managing keys separately).

### Set Auto-Start on Boot

```bash
# The install-system-daemon command already handles this, but verify:
sudo launchctl list | grep tailscale
```

Also add the **Tailscale GUI app** to Login Items:
- `System Settings → General → Login Items` → add **Tailscale**

### Set Hostname (optional but recommended)

```bash
tailscale set --hostname=mac-studio
```

---

## Step 3: Install on MacBook Air (NC)

```bash
# Install
brew install tailscale

# Authenticate — same account as Studio
tailscale up

# Verify both machines appear
tailscale status
```

### Set Hostname

```bash
tailscale set --hostname=macbook-air
```

---

## Step 4: Verify Connection

From MacBook Air:

```bash
# Check both machines are online
tailscale status

# Ping Studio via Tailscale
tailscale ping mac-studio

# SSH into Studio (Tailscale SSH — no keys needed)
ssh username@mac-studio

# Screen Sharing via Tailscale
open vnc://mac-studio
```

From Mac Studio:

```bash
# Ping Air
tailscale ping macbook-air
```

---

## Step 5: Enable MagicDNS

MagicDNS lets you use hostnames instead of IPs.

1. Go to [https://login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns)
2. Enable **MagicDNS** (should be on by default)
3. Now `mac-studio` and `macbook-air` resolve automatically

---

## Step 6: Enable Tailscale SSH (on Studio)

This replaces traditional SSH key management:

```bash
# Already done if you used --ssh flag, but to enable/verify:
tailscale set --ssh
```

In the Tailscale admin console:
1. Go to [https://login.tailscale.com/admin/acls](https://login.tailscale.com/admin/acls)
2. Ensure SSH rules allow your user:

```json
{
  "ssh": [
    {
      "action": "accept",
      "src": ["autogroup:members"],
      "dst": ["autogroup:self"],
      "users": ["autogroup:nonroot", "root"]
    }
  ]
}
```

---

## Step 7: Expose Services (Optional)

### Tailscale Serve (private — only your devices)

Expose services to your Tailscale network only:

```bash
# On Mac Studio — expose dashboard
tailscale serve --bg https://localhost:3000

# Expose x402 server
tailscale serve --bg --set-path /x402 https://localhost:3001
```

Access from Air:
```bash
open https://mac-studio.tail-XXXXX.ts.net          # dashboard
curl https://mac-studio.tail-XXXXX.ts.net/x402     # x402 API
```

### Tailscale Funnel (public — for x402 clients)

Expose to the public internet with auto-HTTPS:

```bash
# On Mac Studio — public endpoint
tailscale funnel --bg 3001
```

This gives you:
- Public HTTPS URL (e.g., `https://mac-studio.tail-XXXXX.ts.net`)
- Auto-TLS certificates (Let's Encrypt via Tailscale)
- No port forwarding, no nginx, no router config

---

## SSH Config (MacBook Air)

Add to `~/.ssh/config` on the Air:

```
Host studio
    HostName mac-studio
    User username
    ForwardAgent yes
    ServerAliveInterval 60
    ServerAliveCountMax 5
    TCPKeepAlive yes
```

Now:
```bash
ssh studio
```

---

## Shell Aliases (MacBook Air)

Add to `~/.zshrc`:

```bash
# Mac Studio shortcuts via Tailscale
alias studio='ssh studio'
alias studio-screen='open vnc://mac-studio'
alias studio-status='ssh studio "cd ~/Documents/XmetaV && openclaw health"'
alias studio-logs='ssh studio "tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log"'
alias studio-deploy='ssh studio "cd ~/Documents/XmetaV && git pull && npm run build"'
alias studio-x402='ssh studio "curl -s localhost:3001/health | jq"'
alias studio-restart='ssh studio "sudo launchctl kickstart -k system/com.xmetav.x402"'
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `tailscale status` shows offline | Run `tailscale up` again, re-authenticate if needed |
| Can't SSH | Check `tailscale set --ssh` is enabled on Studio |
| MagicDNS not resolving | Verify MagicDNS is on in admin console, try `tailscale ping mac-studio` |
| Slow connection | Run `tailscale netcheck` to diagnose, check if DERP relay is being used |
| Funnel not working | Enable in admin: Access Controls → Funnel policy |
| Lost access to Studio | Have NYC contact power cycle it; Tailscale auto-reconnects on boot |

### Useful Commands

```bash
# Check connection quality
tailscale netcheck

# See direct vs relayed connection
tailscale status --peers

# Force re-authentication
tailscale up --force-reauth

# Check Tailscale IP
tailscale ip

# View logs
tailscale bugreport
```

---

## Security Notes

- All traffic is **end-to-end encrypted** (WireGuard)
- No ports exposed on either machine's public IP
- Tailscale SSH uses your Tailscale identity — no password auth needed
- ACL policies control who can access what
- Enable **key expiry** in admin console for extra security
- Consider enabling **2FA** on your Tailscale account

---

## Verification Checklist

- [ ] Tailscale installed on Mac Studio
- [ ] Tailscale installed on MacBook Air
- [ ] Both signed into same Tailscale account
- [ ] `tailscale status` shows both machines online
- [ ] `tailscale ping mac-studio` works from Air
- [ ] `ssh studio` connects without password prompt
- [ ] MagicDNS resolves hostnames
- [ ] Screen Sharing works via `open vnc://mac-studio`
- [ ] Auto-start confirmed: reboot Studio → still accessible
- [ ] Services exposed via Serve/Funnel (when ready)
