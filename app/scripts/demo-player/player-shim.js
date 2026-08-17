// Injected BEFORE the player bundle's module script (classic scripts execute
// first in document order): replaces WebSocket with a fake that speaks the
// player-server protocol against the parent demo page's engine, so the real
// mobile app runs unmodified inside the demo's phone iframe.
(function () {
  'use strict';

  function FakePlayerWs() {
    var self = this;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._session = null;
    this._queue = [];

    // The parent demo engine loads asynchronously; retry until it's there.
    function attach() {
      var demo = null;
      try {
        demo = window.parent && window.parent.__demo;
      } catch (e) {
        demo = null;
      }
      if (!demo || !demo.playerAttach) {
        setTimeout(attach, 120);
        return;
      }
      self._session = demo.playerAttach(function (json) {
        if (self.onmessage) self.onmessage({ data: json });
      });
      self.readyState = 1; // OPEN
      if (self.onopen) self.onopen();
      for (var i = 0; i < self._queue.length; i++) self._session.send(self._queue[i]);
      self._queue.length = 0;
    }
    setTimeout(attach, 0);
  }

  FakePlayerWs.prototype.send = function (json) {
    if (this._session) this._session.send(json);
    else this._queue.push(json);
  };

  FakePlayerWs.prototype.close = function () {
    if (this._session) this._session.close();
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  };

  // The app compares readyState against WebSocket.OPEN — the real constructor
  // carries these static constants, so the fake must too.
  FakePlayerWs.CONNECTING = 0;
  FakePlayerWs.OPEN = 1;
  FakePlayerWs.CLOSING = 2;
  FakePlayerWs.CLOSED = 3;
  FakePlayerWs.prototype.CONNECTING = 0;
  FakePlayerWs.prototype.OPEN = 1;
  FakePlayerWs.prototype.CLOSING = 2;
  FakePlayerWs.prototype.CLOSED = 3;

  window.WebSocket = FakePlayerWs;
})();
