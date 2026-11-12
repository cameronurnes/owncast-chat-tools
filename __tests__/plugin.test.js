// Scenario tests for Chat Tools. Runs via `npm test`.
const { runScenarios } = require("@owncast/plugin-sdk/testing");

const user = (name) => ({ id: name, displayName: name });

runScenarios([
  {
    name: "pushes the user list when someone joins",
    events: [{ event: "chat.user.joined", payload: user("alice") }],
    expect: { sseSends: [{ channel: "room", event: "users" }] },
  },
  {
    name: "pushes the user list when someone leaves",
    events: [{ event: "chat.user.parted", payload: user("alice") }],
    expect: { sseSends: [{ channel: "room", event: "users" }] },
  },
]);
