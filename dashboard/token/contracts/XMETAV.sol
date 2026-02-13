// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title XMETAV — the native token of the XmetaV agent orchestration platform.
 *
 * Fixed supply of 1 000 000 000 (1 B) tokens, all minted to the deployer.
 * Holding XMETAV unlocks tiered discounts on x402-gated endpoints:
 *
 *   0          → no discount
 *   1 000+     → Bronze  10 % off
 *   10 000+    → Silver  20 % off
 *   100 000+   → Gold    35 % off
 *   1 000 000+ → Diamond 50 % off
 */
contract XMETAV is ERC20, Ownable {
    constructor() ERC20("XmetaV", "XMETAV") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }
}
