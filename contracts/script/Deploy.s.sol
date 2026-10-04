// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {GamerIDCard} from "../src/GamerIDCard.sol";

/// @notice Deploys GamerIDCard. Configuration comes from the environment, and the deployer is chosen
/// on the command line (--account <keystore> or --ledger; --private-key only for local anvil).
///
///   GAMERID_OWNER          owner/admin (defaults to the deployer)
///   GAMERID_VOUCHER_SIGNER address that signs mint vouchers (required)
///   GAMERID_PAYOUT         payout address for withdraw() (defaults to the owner)
///   GAMERID_MIN_PRICE_WEI  floor for native payments (required)
///   GAMERID_BASE_URI       e.g. https://gamer-id.vercel.app/api/nft/ (required)
///   GAMERID_REFRESHER      optional address allowed to emit ERC-4906 refresh events
contract Deploy is Script {
    function run() external returns (GamerIDCard card) {
        address signer = vm.envAddress("GAMERID_VOUCHER_SIGNER");
        uint256 minPrice = vm.envUint("GAMERID_MIN_PRICE_WEI");
        string memory baseURI = vm.envString("GAMERID_BASE_URI");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address owner = vm.envOr("GAMERID_OWNER", deployer);
        address payable payout = payable(vm.envOr("GAMERID_PAYOUT", owner));
        address refresher = vm.envOr("GAMERID_REFRESHER", address(0));

        // Deploy with the deployer as temporary owner so the refresher can be set in the same run,
        // then hand ownership to the configured owner (two-step: the owner must call acceptOwnership()
        // if it differs from the deployer).
        card = new GamerIDCard(deployer, signer, payout, minPrice, baseURI);
        if (refresher != address(0)) card.setRefresher(refresher);
        if (owner != deployer) card.transferOwnership(owner);
        vm.stopBroadcast();

        console2.log("GamerIDCard deployed at", address(card));
        console2.log("chainId", block.chainid);
        console2.log("deployer", deployer);
        console2.log("owner (pending if different from deployer)", owner);

        string memory json = "deployment";
        vm.serializeAddress(json, "address", address(card));
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "voucherSigner", signer);
        vm.serializeAddress(json, "payout", payout);
        vm.serializeUint(json, "minPriceWei", minPrice);
        vm.serializeString(json, "baseURI", baseURI);
        string memory out = vm.serializeUint(json, "blockNumber", block.number);
        vm.writeJson(out, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
