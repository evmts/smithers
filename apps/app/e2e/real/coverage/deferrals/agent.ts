// Agent/session real-host journeys remain owed: https://github.com/smithersai/smithers/issues/1873.
export const agent = [
  "agent.session.list", // owner: #1873
  "agent.session.new", // owner: #1873
  "agent.session.say", // owner: #1873
  "agent.session.stop", // owner: #1873
  "agent.session.view", // owner: #1873
  "subagents", // owner: #1873
] as const
