import { lookup } from "dns/promises";
import net from "net";

/**
 * Server-side fetches of URLs someone typed in (image import, image proxy) must
 * never reach our own network: loopback, private ranges, link-local (cloud
 * metadata at 169.254.169.254), CGNAT, ULA. Shared by every route that fetches
 * a user-supplied URL so the rules can't drift.
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local incl. metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (lower === "::1" || lower === "::") return true;
    // IPv4-mapped, dotted (::ffff:127.0.0.1) or hex (::ffff:7f00:1) form.
    const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateIp(dotted[1]);
    const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = lower.split(":")[0];
    if (first) {
      const val = parseInt(first.padEnd(4, "0").slice(0, 4), 16);
      if ((val & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
      if ((val & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    }
    return false;
  }
  return false;
}

/** True when `hostname` is (or resolves only to) public addresses. */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (net.isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && !addrs.some((a) => isPrivateIp(a.address));
  } catch {
    return false;
  }
}
