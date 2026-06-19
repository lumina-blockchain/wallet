/// <reference types="vite/client" />
/// <reference types="@crxjs/vite-plugin/client" />

declare module 'blake3-js' {
  export function createHash(): {
    update(data: Uint8Array | Buffer): any;
    digest(): Uint8Array;
  };
}

declare module 'lumina-blockchain-sdk';
declare const chrome: any;
