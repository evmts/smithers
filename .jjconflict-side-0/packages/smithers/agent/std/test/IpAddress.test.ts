/**
 * `IpAddress` must answer exactly as the `node:net` policy it replaced, so the
 * web tools' destination policy did not move when it left Node. The oracle
 * below is that policy as it stood in `HttpNetwork.ts`; every case, the
 * hand-picked ones and a seeded random sweep, is judged by both.
 */
import { BlockList, isIP } from "node:net"
import { describe, expect, it } from "vitest"
import * as IpAddress from "../src/internal/IpAddress.ts"

const oracle = (() => {
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
  const publicV6 = new BlockList()
  publicV6.addSubnet("2000::", 3, "ipv6")
  publicV6.addSubnet("::ffff:0:0", 96, "ipv6")
  blocked.addSubnet("2002::", 16, "ipv6")
  blocked.addSubnet("2001::", 32, "ipv6")
  return (address: string): boolean => {
    const version = isIP(address)
    if (version === 4) return !blocked.check(address, "ipv4")
    return version === 6 && publicV6.check(address, "ipv6") && !blocked.check(address, "ipv6")
  }
})()

/**
 * Parity, except that a zoned IPv6 address is never public. `BlockList` reads
 * one through libuv's `uv_ip6_addr`, which cuts the text before `%` to 39
 * characters: `2606:2001:6efd:0:ffff:2606:23.192.169.223%1` is judged as
 * `...:23.192.169.2`, and a longer one does not parse at all.
 */
const agrees = (address: string) => {
  expect.soft(IpAddress.family(address), `family of ${JSON.stringify(address)}`).toBe(isIP(address))
  expect.soft(IpAddress.isPublic(address), `isPublic of ${JSON.stringify(address)}`).toBe(
    address.includes("%") ? false : oracle(address)
  )
}

/** A small deterministic generator, so a failing draw is reproducible from its seed. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}

describe("IpAddress", () => {
  it("classifies the boundary cases as node:net does", () => {
    const cases = [
      // IPv4: the ranges, their edges, and malformed spellings
      "8.8.8.8",
      "0.0.0.0",
      "0.255.255.255",
      "1.0.0.0",
      "9.255.255.255",
      "10.0.0.0",
      "11.0.0.0",
      "100.63.255.255",
      "100.64.0.0",
      "100.127.255.255",
      "100.128.0.0",
      "126.255.255.255",
      "127.0.0.1",
      "128.0.0.0",
      "169.253.255.255",
      "169.254.169.254",
      "169.255.0.0",
      "172.15.255.255",
      "172.16.0.0",
      "172.31.255.255",
      "172.32.0.0",
      "192.0.0.255",
      "192.0.1.0",
      "192.0.2.10",
      "192.167.255.255",
      "192.168.1.1",
      "192.169.0.0",
      "198.17.255.255",
      "198.18.0.0",
      "198.19.255.255",
      "198.20.0.0",
      "223.255.255.255",
      "224.0.0.1",
      "239.255.255.255",
      "240.0.0.0",
      "255.255.255.255",
      "01.2.3.4",
      "1.2.3.04",
      "1.2.3",
      "1.2.3.4.5",
      "256.1.1.1",
      "1.2.3.-1",
      " 1.2.3.4",
      "1.2.3.4 ",
      "0x7f.0.0.1",
      "1..2.3",
      "",
      ".",
      // IPv6: global unicast, tunnels, mapped and compatible IPv4, and every compression shape
      "2001:db8::1",
      "2001:4860::8888",
      "2001::1",
      "2001:0:ffff::1",
      "2001:1::1",
      "2002::1",
      "2002:ffff::1",
      "2003::1",
      "2606:4700::1111",
      "2606:4700:0:0:0:0:0:1111",
      "2606:4700::0:1111",
      "2a00:1450::1",
      "3fff:ffff::1",
      "4000::1",
      "1fff:ffff::1",
      "fd00::1",
      "fe80::1",
      "ff02::1",
      "::1",
      "::",
      "1::",
      "ABCD::1",
      "abcd:EF01::1",
      "::ffff:10.0.0.1",
      "::ffff:8.8.8.8",
      "::ffff:a00:1",
      "::ffff:808:808",
      "::ffff:7f00:1",
      "0:0:0:0:0:ffff:7f00:1",
      "::ffff:ffff:ffff",
      "::ffff:0:1.2.3.4",
      "::ffff:01.2.3.4",
      "::ffff:1.2.3",
      "::10.0.0.1",
      "::8.8.8.8",
      "::1.2.3.4",
      "1::1.2.3.4",
      "2606::1.2.3.4",
      "64:ff9b::8.8.8.8",
      "1:2:3:4:5:6:1.2.3.4",
      "1:2:3:4:5:6:7:1.2.3.4",
      "1.2.3.4::",
      "1.2.3.4::1",
      "::1.2.3.4:1",
      "1:2:3:4:5:6:7:8",
      "2606:2:3:4:5:6:7:8",
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4:5:6:7::",
      "::1:2:3:4:5:6:7",
      "1:2:3:4:5:6::7:8",
      "1::2::3",
      ":::",
      "1:::2",
      ":1::",
      "1:",
      ":1",
      "12345::1",
      "g::1",
      "[::1]",
      // Zone suffixes: IPv6 to net.isIP, never public
      "fe80::1%eth0",
      "2606:4700::1111%eth0",
      "2606:4700::1111%a.b-c:d",
      "::ffff:1.2.3.4%x",
      "::ffff:10.0.0.1%x",
      "2606:4700::1111%",
      "2606:4700::1111%e th0",
      "2606:4700::1111%%",
      "1.2.3.4%eth0",
      "1:2:3:4:5:6:7:8%z",
      "::%z",
      "2606:2001:6efd:0:ffff:2606:23.192.169.223%1",
      "2606:2001:6efd:0:ffff:2606:223.192.169.22%1"
    ]
    for (const address of cases) agrees(address)
  })

  it("classifies a seeded random sweep of addresses and near-addresses as node:net does", () => {
    const next = random(20261020)
    const pick = <A>(items: ReadonlyArray<A>): A => items[Math.floor(next() * items.length)]!
    const byte = () =>
      String(
        pick([0, 1, 9, 10, 63, 64, 100, 127, 128, 169, 172, 192, 198, 223, 224, 240, 255, Math.floor(next() * 256)])
      )
    const hex = () => Math.floor(next() * 0x10000).toString(16)
    const v6 = () => {
      const groups = Array.from(
        { length: 8 },
        () => pick(["0", "ffff", "2001", "2002", "2606", "fe80", "fd00", "ff02", "64", hex(), hex()])
      )
      if (next() < 0.4) groups.splice(6, 2, `${byte()}.${byte()}.${byte()}.${byte()}`)
      const text = groups.join(":")
      if (next() < 0.5) return text
      // Compress one run of zero groups the way an address would be written.
      const start = Math.floor(next() * groups.length)
      const end = start + Math.floor(next() * (groups.length - start))
      return `${groups.slice(0, start).join(":")}::${groups.slice(end + 1).join(":")}`
    }
    const shapes = [
      () => `${byte()}.${byte()}.${byte()}.${byte()}`,
      v6,
      () => `::ffff:${byte()}.${byte()}.${byte()}.${byte()}`,
      () => `${v6()}%${pick(["eth0", "1", "a.b", ""])}`,
      () => Array.from({ length: Math.floor(next() * 24) }, () => pick([..."0123456789abcdefABCDEF:.%g-"])).join("")
    ]
    for (let draw = 0; draw < 20_000; draw++) agrees(pick(shapes)())
  })
})
