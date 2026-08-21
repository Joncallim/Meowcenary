// Minimal Phaser stub for the zero-allocation probe bundle
// (tests/fixtures/allocProbe.entry.ts): input.ts only touches
// Phaser.Input.Keyboard.KeyCodes at runtime — everything else it imports from
// phaser is types. Bundling the real Phaser into a node child process would
// pull in browser globals; this stub keeps the bundle minimal and node-safe.
export default {
  Input: {
    Keyboard: {
      KeyCodes: {
        W: 'W', A: 'A', S: 'S', D: 'D',
        UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT',
        ENTER: 'ENTER', SPACE: 'SPACE', ESC: 'ESC', P: 'P', I: 'I', Q: 'Q',
      },
    },
  },
};
