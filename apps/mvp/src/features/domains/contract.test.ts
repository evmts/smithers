import { describe, expect, test } from "vitest"
import { normalizeHostname, parseDomainRoute, domainsRoute, domainRoute, isApex, isUnder, routingRecord, writeExecutionId } from "./contract.ts"

describe("domain contract", () => {
  test.each([ ["  WWW.Example.COM. ", "www.example.com"], ["xn--bcher-kva.example", "xn--bcher-kva.example"], [`${"a".repeat(63)}.com`, `${"a".repeat(63)}.com`], ["a-b.c0m", "a-b.c0m"], [`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`, `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`] ])("normalizes %s", (raw, expected) => expect(normalizeHostname(raw!)).toBe(expected))
  test.each(["", " ", "localhost", "a".repeat(254), `${"a".repeat(64)}.com`, "a_.com", "é.com", "-a.com", "a-.com", "a..com", "a.123", "127.0.0.1", "*.example.com", "https://example.com", "example.com:80", "example.com/path", "example.com.."]) ("rejects %s", raw => expect(normalizeHostname(raw)).toBeUndefined())
  test("routes round trip encoded components and reject malformed paths", () => {
    expect(domainsRoute("a/b", "a b")).toBe("/api/repos/a%2Fb/a%20b/domains")
    expect(parseDomainRoute(domainsRoute("a/b", "a b"))).toEqual({ owner: "a/b", name: "a b" })
    expect(domainRoute("a", "b", "x/y")).toBe("/api/repos/a/b/domains/x%2Fy")
    expect(parseDomainRoute(domainRoute("a", "b", "x/y"))).toEqual({ owner: "a", name: "b", hostname: "x/y" })
    for (const path of ["/", "/api/repos/a/b/domains/", "/api/repos/a/b/domains/x/y", "/api/repos/%/b/domains", "/api/repos/a/%/domains", "/api/repos/a/b/domains/%"]) expect(parseDomainRoute(path)).toBeUndefined()
  })
  test("routing and write helpers", () => {
    expect(isApex("example.com")).toBe(true)
    expect(isApex("www.example.com")).toBe(false)
    expect(isUnder("example.com", "example.com")).toBe(true)
    expect(isUnder("a.example.com", "example.com")).toBe(true)
    expect(isUnder("badexample.com", "example.com")).toBe(false)
    expect(routingRecord("example.com", "target")).toEqual({ type: "ALIAS", name: "example.com", value: "target" })
    expect(routingRecord("a.example.com", "target")).toEqual({ type: "CNAME", name: "a.example.com", value: "target" })
    expect(writeExecutionId("add", "1")).toBe("domain-add:1")
    expect(writeExecutionId("remove", "2")).toBe("domain-remove:2")
  })
})
