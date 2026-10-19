// E-7/EK4402: node:net BlockList and isIP are Node platform APIs, which VibeLang code does not call directly.
// The plain synchronous address checks of internal/HttpNetwork.ts, moved here unchanged.
import { BlockList, isIP as netIsIP } from "node:net"

export const isIP = (address: string): number => netIsIP(address)

const blocked = new BlockList()
for (
  const [address, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.168.0.0", 16],
    ["192.0.0.0", 24],
    ["100.64.0.0", 10],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4]
  ] as const
) blocked.addSubnet(address, prefix, "ipv4")
// Allow global IPv6 and mapped IPv4 only, excluding transition tunnels.
const publicV6 = new BlockList()
publicV6.addSubnet("2000::", 3, "ipv6")
publicV6.addSubnet("::ffff:0:0", 96, "ipv6")
blocked.addSubnet("2002::", 16, "ipv6")
blocked.addSubnet("2001::", 32, "ipv6")

export const isPublic = (address: string): boolean => {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address, "ipv4")
  return family === 6 && publicV6.check(address, "ipv6") && !blocked.check(address, "ipv6")
}
