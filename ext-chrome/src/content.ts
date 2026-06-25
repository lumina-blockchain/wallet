// BigChain Wallet Content Script (content.ts)

// 1. Inject the provider script (inpage.js) into the webpage context
function injectProvider() {
  try {
    const container = document.head || document.documentElement;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inpage.js');
    script.onload = () => script.remove();
    container.insertBefore(script, container.firstChild);
  } catch (error) {
    console.error('BigChain provider injection failed:', error);
  }
}

injectProvider();

// 2. Relay messages from webpage (inpage.js) to Extension Background
window.addEventListener('message', (event) => {
  // Only handle trusted messages coming from our provider
  if (event.source !== window || !event.data || event.data.source !== 'bigchain-provider') {
    return;
  }

  const { id, method, params } = event.data;

  // Send request to Background Service Worker
  chrome.runtime.sendMessage({
    type: 'BIGCHAIN_PROVIDER_REQUEST',
    payload: { id, method, params }
  }, (response: any) => {
    // If runtime.lastError occurs, handle it gracefully
    if (chrome.runtime.lastError) {
      window.postMessage({
        source: 'bigchain-contentscript',
        id,
        error: chrome.runtime.lastError.message
      }, '*');
      return;
    }

    // Send response back to webpage context
    if (response) {
      window.postMessage({
        source: 'bigchain-contentscript',
        id,
        result: response.result,
        error: response.error
      }, '*');
    }
  });
});

// 3. Listen to notifications/updates from background script
chrome.runtime.onMessage.addListener((message: any) => {
  if (!message || !message.type) return;

  if (message.type === 'BIGCHAIN_BG_ACCOUNTS_CHANGED') {
    window.postMessage({
      source: 'lumina-contentscript',
      type: 'BIGCHAIN_ACCOUNTS_CHANGED',
      payload: { address: message.payload.address }
    }, '*');
  }
});
