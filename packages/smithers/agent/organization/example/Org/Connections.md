---
connections:
  - { id: chat-assistant, provider: slack, label: Assistant bot, credential: { id: chat-assistant, name: chat-assistant }, scopes: [chat:write, im:history], personal: false, containers: [owner-dm, team] }
  - { id: chat-lead, provider: slack, label: Lead bot, credential: { id: chat-lead, name: chat-lead }, scopes: [chat:write], personal: false, containers: [team] }
  - { id: calendar-owner, provider: googlecalendar, label: Owner calendar, credential: { id: calendar-owner, name: calendar-owner }, scopes: [calendar.events, calendar.freebusy], personal: true, containers: [primary] }
containerAliases:
  owner-dm: null
  team: null
---

# Connections

Credential references only. Container aliases stay `null` until setup maps them to provider ids.
