// BigChain Wallet Background Script (background.ts)
import { LuminaClient } from 'lumina-blockchain-sdk'

let client = new LuminaClient("https://rpc1.bariscode.my.id");

// Load saved RPC URL asynchronously on background script startup
chrome.storage.local.get(['bigchain_rpc_url'], (res: any) => {
  if (res && res.bigchain_rpc_url) {
    client = new LuminaClient(res.bigchain_rpc_url);
    console.log("Background initialized with RPC:", res.bigchain_rpc_url);
  }
});

// Watch for changes to the RPC URL
chrome.storage.onChanged.addListener((changes: any, areaName: string) => {
  if (areaName === 'local' && changes.bigchain_rpc_url) {
    const newUrl = changes.bigchain_rpc_url.newValue || "https://rpc1.bariscode.my.id";
    client = new LuminaClient(newUrl);
    console.log("Background updated to RPC:", newUrl);
  }
});

// Connection States (in-memory pending requests)
const pendingRequests = new Map<string, (response: any) => void>()

// Listen to messages from content script or popup
chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
  if (!message || !message.type) return;

  const origin = sender.origin || (sender.tab ? new URL(sender.tab.url || '').origin : null);

  // 1. Process dApp Requests (forwarded by Content Script)
  if (message.type === 'BIGCHAIN_PROVIDER_REQUEST') {
    const { id, method, params } = message.payload;
    handleProviderRequest(id, method, params, origin, sendResponse);
    return true; // Keep message channel open for async response
  }

  // 2. Process User Approvals (sent by React Popup UI)
  if (message.type === 'BIGCHAIN_APPROVE_REQUEST') {
    const { reqId, result } = message.payload;
    const resolve = pendingRequests.get(reqId);
    if (resolve) {
      pendingRequests.delete(reqId);
      resolve({ result: result.value || result });
    }
    clearBadge();
  }

  // 3. Process User Rejections (sent by React Popup UI)
  if (message.type === 'BIGCHAIN_REJECT_REQUEST') {
    const { reqId, reason } = message.payload;
    const resolve = pendingRequests.get(reqId);
    if (resolve) {
      pendingRequests.delete(reqId);
      resolve({ error: reason || 'User rejected request' });
    }
    clearBadge();
  }
});

async function handleProviderRequest(
  id: string,
  method: string,
  params: any,
  origin: string | null,
  sendResponse: (response: any) => void
) {
  try {
    switch (method) {
      case 'big_requestAccounts': {
        // If already connected, return account immediately
        const saved = await chrome.storage.local.get(['bigchain_vault', 'connectedOrigins']);
        const vault = saved.bigchain_vault;
        const connectedList = saved.connectedOrigins || [];

        if (origin && connectedList.includes(origin) && vault && vault.address) {
          sendResponse({ result: [vault.address] });
          return;
        }

        if (!vault || !vault.address) {
          sendResponse({ error: "BigChain Wallet is not initialized yet. Please open wallet and create/import an account." });
          return;
        }

        // Add to pending request queue and notify user via badge
        pendingRequests.set(id, sendResponse);
        
        await chrome.storage.local.set({
          pendingDappRequest: {
            id,
            method,
            origin,
            params,
            address: vault.address
          }
        });

        // Show badge notification on extension icon
        notifyPendingRequest();
        break;
      }

      case 'big_accounts': {
        const saved = await chrome.storage.local.get(['bigchain_vault', 'connectedOrigins']);
        const vault = saved.bigchain_vault;
        const connectedList = saved.connectedOrigins || [];

        if (origin && connectedList.includes(origin) && vault && vault.address) {
          sendResponse({ result: [vault.address] });
        } else {
          sendResponse({ result: [] });
        }
        break;
      }

      case 'big_getBalance': {
        const address = params?.address;
        if (!address) {
          sendResponse({ error: "Missing address parameter" });
          return;
        }
        const state = await client.getBalance(address);
        sendResponse({ result: state.balance.toString() });
        break;
      }

      case 'big_estimateFee': {
        const data = params?.data || [];
        const fee = await client.estimateFee(data);
        sendResponse({ result: fee });
        break;
      }

      case 'big_sendTransaction': {
        // Must be connected first
        const saved = await chrome.storage.local.get(['bigchain_vault', 'connectedOrigins']);
        const vault = saved.bigchain_vault;
        const connectedList = saved.connectedOrigins || [];

        if (!origin || !connectedList.includes(origin) || !vault || !vault.address) {
          sendResponse({ error: "Unauthorized. Call big_requestAccounts first." });
          return;
        }

        // Add to pending request queue
        pendingRequests.set(id, sendResponse);

        await chrome.storage.local.set({
          pendingDappRequest: {
            id,
            method,
            origin,
            params,
            address: vault.address
          }
        });

        notifyPendingRequest();
        break;
      }

      case 'big_signTransaction':
      case 'big_signAsFeePayer': {
        const saved = await chrome.storage.local.get(['bigchain_vault', 'connectedOrigins']);
        const vault = saved.bigchain_vault;
        const connectedList = saved.connectedOrigins || [];

        if (!origin || !connectedList.includes(origin) || !vault || !vault.address) {
          sendResponse({ error: "Unauthorized. Call big_requestAccounts first." });
          return;
        }

        pendingRequests.set(id, sendResponse);

        await chrome.storage.local.set({
          pendingDappRequest: {
            id,
            method,
            origin,
            params,
            address: vault.address
          }
        });

        notifyPendingRequest();
        break;
      }

      default:
        sendResponse({ error: `Method '${method}' not supported` });
        break;
    }
  } catch (err: any) {
    sendResponse({ error: err.message || "Internal RPC Error" });
  }
}

// Show a red badge "1" on the extension icon to alert user of pending request
// Notify user of pending dApp request - try to auto-open popup, fallback to badge
async function notifyPendingRequest() {
  // Always set badge as visual indicator
  chrome.action.setBadgeText({ text: '1' });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  chrome.action.setTitle({ title: 'BigChain Wallet — Ada permintaan dApp menunggu persetujuan!' });

  // Try to auto-open the native extension popup (Chrome 127+)
  try {
    if (chrome.action && typeof (chrome.action as any).openPopup === 'function') {
      await (chrome.action as any).openPopup();
    }
  } catch (_e) {
    // Popup couldn't be opened automatically - badge will alert the user
    console.log('Auto-open popup not available, badge notification shown instead.');
  }
}

// Clear badge when request is resolved
function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setTitle({ title: 'BigChain Wallet' });
}

