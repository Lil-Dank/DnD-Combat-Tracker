// Browser stub for '@elgato/streamdeck': just enough surface for picker.ts
// and bridge.ts. Profile switches are forwarded to the demo panel so it can
// swap between the action keys and the picker grid.
export const profileListeners = new Set();

const streamDeck = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  profiles: {
    switchToProfile: async (_deviceId, profile) => {
      for (const cb of profileListeners) cb(profile ?? null);
    },
  },
};

export default streamDeck;
