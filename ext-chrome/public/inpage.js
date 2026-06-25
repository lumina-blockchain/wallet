// BigChain Wallet DApp Provider Injection (inpage.js)
(() => {
  if (window.bigchain) {
    console.warn("BigChain Provider already injected.");
    return;
  }

  class BigChainProvider {
    constructor() {
      this.isBigChain = true;
      this._address = null;
      this._isConnected = false;
      this._listeners = new Map();

      // Listen to response messages from Content Script
      window.addEventListener('message', (event) => {
        // Only trust messages coming from the content script (our bridge)
        if (event.source !== window || !event.data || event.data.source !== 'bigchain-contentscript') {
          return;
        }

        const { type, payload } = event.data;

        if (type === 'BIGCHAIN_ACCOUNTS_CHANGED') {
          const oldAddress = this._address;
          this._address = payload.address || null;
          this._isConnected = !!this._address;

          if (oldAddress !== this._address) {
            this._emit('accountsChanged', this._address ? [this._address] : []);
          }
        }
      });
    }

    isConnected() {
      return this._isConnected;
    }

    getAddress() {
      return this._address;
    }

    async request({ method, params }) {
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(2);

        const responseListener = (event) => {
          if (
            event.source === window &&
            event.data &&
            event.data.source === 'bigchain-contentscript' &&
            event.data.id === id
          ) {
            window.removeEventListener('message', responseListener);
            
            if (event.data.error) {
              reject(new Error(event.data.error));
            } else {
              if (method === 'bigchain_requestAccounts' || method === 'bigchain_accounts') {
                this._address = event.data.result ? event.data.result[0] : null;
                this._isConnected = !!this._address;
              }
              resolve(event.data.result);
            }
          }
        };

        window.addEventListener('message', responseListener);

        // Forward request to Content Script
        window.postMessage({
          source: 'bigchain-provider',
          id,
          method,
          params
        }, '*');
      });
    }

    // Simple Event Emitter
    on(event, callback) {
      if (typeof callback !== 'function') return;
      if (!this._listeners.has(event)) {
        this._listeners.set(event, []);
      }
      this._listeners.get(event).push(callback);
    }

    removeListener(event, callback) {
      if (!this._listeners.has(event)) return;
      const list = this._listeners.get(event);
      const index = list.indexOf(callback);
      if (index !== -1) {
        list.splice(index, 1);
      }
    }

    _emit(event, data) {
      if (!this._listeners.has(event)) return;
      for (const cb of this._listeners.get(event)) {
        try { cb(data); } catch (e) { console.error("Event callback error:", e); }
      }
    }
  }

  window.bigchain = new BigChainProvider();
  console.log("💎 BigChain Web3 Provider successfully injected.");
})();
