/**
 * Minimal ABI for ERC-8004 ReputationRegistryUpgradeable
 * Source: https://github.com/erc-8004/erc-8004-contracts
 * Deployed on Base Mainnet: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 */
export const REPUTATION_REGISTRY_ABI = [
  // giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpointURI, string feedbackURI, bytes32 feedbackHash)
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpointURI", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  // getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) → (uint256 count, int128 summaryValue, uint8 summaryValueDecimals)
  {
    name: "getSummary",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint256" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
  // readFeedback(uint256 agentId, address clientAddress, uint256 feedbackIndex)
  {
    name: "readFeedback",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddress", type: "address" },
      { name: "feedbackIndex", type: "uint256" },
    ],
    outputs: [
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpointURI", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
      { name: "revoked", type: "bool" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  // Events
  {
    name: "FeedbackGiven",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "value", type: "int128", indexed: false },
      { name: "valueDecimals", type: "uint8", indexed: false },
    ],
  },
] as const;

export const REPUTATION_REGISTRY_ADDRESS = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;
