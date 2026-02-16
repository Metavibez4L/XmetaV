// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentMemoryAnchor
 * @notice Lightweight on-chain anchoring for agent memories.
 *         Full memory blobs live on IPFS; this contract stores only
 *         the content hash + category + chain link to previous anchor.
 *
 *         Cost: ~45k gas per anchor (~$0.0001 on Base).
 */
contract AgentMemoryAnchor {
    struct Anchor {
        uint256 timestamp;
        bytes32 contentHash;     // keccak256(ipfsCid)
        bytes32 previousAnchor;  // chain link to prior anchor's contentHash
        uint8   category;        // 0=milestone, 1=decision, 2=incident
    }

    /// agentId => ordered list of anchors
    mapping(uint256 => Anchor[]) public agentAnchors;

    /// agentId => total anchor count
    mapping(uint256 => uint256) public anchorCount;

    /// Addresses allowed to write anchors (bridge daemon, owner)
    mapping(address => bool) public writers;

    address public owner;

    event MemoryAnchored(
        uint256 indexed agentId,
        uint256 indexed index,
        bytes32 contentHash,
        uint8   category
    );

    event WriterUpdated(address indexed writer, bool allowed);

    modifier onlyWriter() {
        require(writers[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        writers[msg.sender] = true;
    }

    /**
     * @notice Anchor a memory hash on-chain for a given agent.
     * @param agentId   ERC-8004 token ID of the agent
     * @param contentHash  keccak256 of the IPFS CID string
     * @param category  0=milestone, 1=decision, 2=incident
     */
    function anchor(
        uint256 agentId,
        bytes32 contentHash,
        uint8 category
    ) external onlyWriter {
        bytes32 prev = anchorCount[agentId] > 0
            ? agentAnchors[agentId][anchorCount[agentId] - 1].contentHash
            : bytes32(0);

        agentAnchors[agentId].push(Anchor({
            timestamp: block.timestamp,
            contentHash: contentHash,
            previousAnchor: prev,
            category: category
        }));

        anchorCount[agentId]++;
        emit MemoryAnchored(agentId, anchorCount[agentId] - 1, contentHash, category);
    }

    /**
     * @notice Get the latest anchor for an agent.
     */
    function getLatest(uint256 agentId) external view returns (Anchor memory) {
        require(anchorCount[agentId] > 0, "No anchors");
        return agentAnchors[agentId][anchorCount[agentId] - 1];
    }

    /**
     * @notice Get a specific anchor by index.
     */
    function getAnchor(uint256 agentId, uint256 index) external view returns (Anchor memory) {
        require(index < anchorCount[agentId], "Index out of bounds");
        return agentAnchors[agentId][index];
    }

    /**
     * @notice Get a range of anchors (for pagination).
     */
    function getAnchors(
        uint256 agentId,
        uint256 from,
        uint256 count
    ) external view returns (Anchor[] memory) {
        uint256 total = anchorCount[agentId];
        if (from >= total) return new Anchor[](0);

        uint256 end = from + count;
        if (end > total) end = total;

        Anchor[] memory result = new Anchor[](end - from);
        for (uint256 i = from; i < end; i++) {
            result[i - from] = agentAnchors[agentId][i];
        }
        return result;
    }

    /**
     * @notice Add or remove a writer address.
     */
    function setWriter(address writer, bool allowed) external onlyOwner {
        writers[writer] = allowed;
        emit WriterUpdated(writer, allowed);
    }

    /**
     * @notice Transfer ownership.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }
}
