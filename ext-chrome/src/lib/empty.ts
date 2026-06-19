// Mock empty file to bypass Node-specific gRPC bundles in Chrome extension
export default {};
export const loadSync = () => ({});
export const loadPackageDefinition = () => ({});
export const credentials = {
  createInsecure: () => ({})
};

// Stub class to satisfy index.js export checks in the Chrome extension bundler
export class LuminaGrpcClient {
  constructor() {
    console.warn("LuminaGrpcClient is disabled in the browser extension environment.");
  }
  getAccountState() { return Promise.resolve({}); }
  getBlockByHeight() { return Promise.resolve({}); }
  submitTransaction() { return Promise.resolve({}); }
  subscribeBlocks() { return { on: () => {} }; }
}
