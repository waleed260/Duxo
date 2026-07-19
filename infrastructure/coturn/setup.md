# Oracle Coturn TURN Server Setup (Path B only)

## Why (§0.8)

Metered.ca (50 GB/mo free) is the primary TURN. Oracle Coturn is the **fallback**
for when Metered's quota burns or service goes down. This is Path B only.

## Oracle Cloud capacity risk (§0.8)

Oracle Always-Free ARM instances frequently show "out of host capacity" errors.
Mitigation: try provisioning across multiple regions, retry over several days,
fall back to STUN-only mode if Oracle fails entirely.

**Estimated maintenance: 2–4 hours/month** — OS patches, quarterly credential
rotation, monitoring for relay abuse. If you can't commit, stay on Path A.

## Provisioning

### Regions to try (in order)
1. Phoenix (US)
2. Ashburn (US)
3. Frankfurt (DE)
4. Amsterdam (NL)

### Specs (Always-Free tier)
- 4 Ampere A1 cores, 24 GB RAM, 200 GB storage, 10 TB bandwidth/mo
- **Card required for identity verification only** — no charges within Always-Free limits
- **Set a $0 budget alert immediately** after signup

### Install Coturn

```bash
sudo apt update
sudo apt install -y coturn

# Enable as a service
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

### Configure `/etc/turnserver.conf`

```ini
# Listener
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0

# Relay
relay-ip=<YOUR_ORACLE_VM_PUBLIC_IP>
min-port=49152
max-port=65535

# Authentication (long-term credential mechanism)
lt-cred-mech
use-auth-secret
static-auth-secret=<ROTATE_QUARTERLY>
realm=turn.duxo.dev

# Security
no-multicast-peers
no-tlsv1
no-tlsv1_1

# Logging
log-file=/var/log/turnserver.log
```

### Firewall (Oracle Cloud security list + iptables)

```bash
sudo iptables -A INPUT -p udp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 5349 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5349 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 49152:65535 -j ACCEPT
```

### Start and verify

```bash
sudo systemctl restart coturn
sudo systemctl enable coturn
sudo systemctl status coturn

# Test with Trickle ICE (https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
# Add your Oracle server as a TURN server with the credentials above.
```

## Credential rotation (§0.8, quarterly)

1. Generate new `static-auth-secret`
2. Update `/etc/turnserver.conf`
3. Update `host-agent/.env` with the new credential
4. Restart Coturn: `sudo systemctl restart coturn`
5. Monitor Oracle Cloud dashboard for relay abuse anomalies
