// Browser stub for 'ws': the bridge "connects" instantly, and the page feeds
// it state messages / receives commands through window hooks instead of a
// real socket to the desktop app.
export default class FakeWs {
  static OPEN = 1;
  static instances = [];

  constructor() {
    this.readyState = 1;
    this.handlers = {};
    FakeWs.instances.push(this);
    setTimeout(() => this.emit('open'), 0);
  }

  on(event, cb) {
    (this.handlers[event] ??= []).push(cb);
    return this;
  }

  emit(event, ...args) {
    for (const cb of this.handlers[event] ?? []) cb(...args);
  }

  send(json) {
    const demo = window.__demo;
    if (demo) demo.command(JSON.parse(json));
  }

  close() {}
  terminate() {}
}
