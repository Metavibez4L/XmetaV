/**
 * Pinata IPFS Client — pins JSON memory blobs to IPFS via Pinata's API.
 * Free tier: 1 GB storage, plenty for memory anchors (~1-2 KB each).
 */

const PINATA_API = "https://api.pinata.cloud";
const PINATA_JWT = process.env.PINATA_JWT;

export interface PinResult {
  ipfsHash: string;
  pinSize: number;
  timestamp: string;
}

/**
 * Pin a JSON object to IPFS via Pinata.
 * Returns the IPFS CID (content identifier).
 */
export async function pinJSON(
  data: Record<string, unknown>,
  name?: string
): Promise<PinResult> {
  if (!PINATA_JWT) {
    throw new Error("PINATA_JWT not set — cannot pin to IPFS");
  }

  const body = {
    pinataContent: data,
    pinataMetadata: {
      name: name || `xmetav-memory-${Date.now()}`,
    },
  };

  const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata pin failed (${res.status}): ${text}`);
  }

  const result = (await res.json()) as { IpfsHash: string; PinSize: number; Timestamp: string };

  return {
    ipfsHash: result.IpfsHash,
    pinSize: result.PinSize,
    timestamp: result.Timestamp,
  };
}

/**
 * Check if Pinata is configured and reachable.
 */
export function isPinataConfigured(): boolean {
  return !!PINATA_JWT;
}

/**
 * Build a gateway URL for an IPFS hash.
 */
export function ipfsGatewayURL(cid: string): string {
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}
