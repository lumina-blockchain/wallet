import { bech32m } from 'bech32'
import nacl from 'tweetnacl'
import { blake3 } from '@noble/hashes/blake3.js'
import { ethers } from 'ethers'

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

const RPC_URL = "https://rpc1.bariscode.my.id";

console.log(yellow("🧪 LUMINA INTEGRATION TEST: SUBMIT TRANSACTION (VALUE AS NUMBER)\n"));

const encodeVarint = (value: bigint | number): Uint8Array => {
  const v = BigInt(value)
  if (v <= BigInt(250)) return new Uint8Array([Number(v)])
  if (v <= BigInt(0xFFFF)) {
    const buf = new Uint8Array(3); buf[0] = 251
    new DataView(buf.buffer).setUint16(1, Number(v), true); return buf
  }
  if (v <= BigInt(0xFFFFFFFF)) {
    const buf = new Uint8Array(5); buf[0] = 252
    new DataView(buf.buffer).setUint32(1, Number(v), true); return buf
  }
  if (v <= BigInt("0xFFFFFFFFFFFFFFFF")) {
    const buf = new Uint8Array(9); buf[0] = 253
    new DataView(buf.buffer).setBigUint64(1, v, true); return buf
  }
  const buf = new Uint8Array(17); buf[0] = 254
  const view = new DataView(buf.buffer)
  view.setBigUint64(1, v & BigInt("0xFFFFFFFFFFFFFFFF"), true)
  view.setBigUint64(9, v >> BigInt(64), true)
  return buf
}

const serializeTransaction = (from: string, to: string, value: string, nonce: number, data: number[]) => {
  const fromRaw = new Uint8Array(bech32m.fromWords(bech32m.decode(from).words))
  const toRaw = new Uint8Array(bech32m.fromWords(bech32m.decode(to).words))

  const parts = [fromRaw, toRaw, encodeVarint(BigInt(value)), encodeVarint(nonce), encodeVarint(data.length)]
  if (data.length > 0) parts.push(new Uint8Array(data))

  const totalLen = parts.reduce((acc, p) => acc + p.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const p of parts) { result.set(p, offset); offset += p.length }
  return result
}

async function runIntegrationTest() {
  try {
    const fromAddr = "lumina1rlnjrlke3uff992eexch6zyvphld4d4puv9za8";
    const toAddr = "lumina1y6gq9tfktzfz0ah4jd27xlzj9fls4ckwgl7h2t";
    const secret_hex = "fdc94d54460e2b7e548f294bb58e4d525b5a67cd95ed7de2be477a9379db2630";
    const seed = ethers.getBytes(`0x${secret_hex}`).slice(0, 32);

    const balanceResp = await fetch(`${RPC_URL}/balance/${fromAddr}`);
    const balanceData: any = await balanceResp.json();
    const nonce = balanceData.next_nonce || 0;

    const value = ethers.parseUnits("0.0001", 18).toString();
    const txBytes = serializeTransaction(fromAddr, toAddr, value, nonce, []);
    const hash = blake3(txBytes);

    const keypair = nacl.sign.keyPair.fromSeed(new Uint8Array(seed));
    const signature = nacl.sign.detached(hash, keypair.secretKey);

    const fromRaw = Array.from(new Uint8Array(bech32m.fromWords(bech32m.decode(fromAddr).words)));
    const toRaw = Array.from(new Uint8Array(bech32m.fromWords(bech32m.decode(toAddr).words)));

    // Trik: Gunakan JSON string manual biar BigInt nggak kena petik
    const payloadStr = JSON.stringify({
        transaction: { 
            from: fromRaw,
            to: toRaw,
            value: 0, // Placeholder
            nonce: nonce, 
            data: [] 
        },
        signature: Array.from(signature),
        pubkey: Array.from(keypair.publicKey)
    }).replace('"value":0', `"value":${value}`); // Paksa masukin angka tanpa tanda kutip

    console.log(cyan(`\n[4] Submitting with Pure Number Value...`));
    const submitResp = await fetch(`${RPC_URL}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr
    });

    const textResult = await submitResp.text();
    console.log(`    Response: ${textResult}`);

    if (textResult.includes('"status":"ok"')) {
        console.log(green(`\n✅ SUCCESS! Tx Hash: ${JSON.parse(textResult).hash}`));
    } else {
        console.log(red(`\n❌ ERROR: ${textResult}`));
    }

  } catch (e: any) {
    console.error(red(`\n💥 TEST ERROR: ${e.message}`));
  }
}

runIntegrationTest();
