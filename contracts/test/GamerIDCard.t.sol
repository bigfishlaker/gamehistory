// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {GamerIDCard, IERC5192} from "../src/GamerIDCard.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Payout address that refuses native transfers.
contract RejectingPayout {
    receive() external payable {
        revert("no thanks");
    }
}

/// @dev Payout address that tries to re-enter withdraw() when paid.
contract ReenteringPayout {
    GamerIDCard public card;
    bool public attempted;
    bool public reentrySucceeded;

    function setCard(GamerIDCard c) external {
        card = c;
    }

    receive() external payable {
        if (!attempted) {
            attempted = true;
            try card.withdraw() {
                reentrySucceeded = true;
            } catch {}
        }
    }
}

contract GamerIDCardTest is Test {
    GamerIDCard internal card;
    MockUSDC internal usdc;

    uint256 internal signerKey = 0xA11CE;
    address internal signer;
    address internal owner = makeAddr("owner");
    address payable internal payout = payable(makeAddr("payout"));
    address internal refresher = makeAddr("refresher");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant MIN_PRICE = 0.005 ether;
    uint256 internal constant PRICE = 0.0077 ether; // ~$5 at ~$651/HERESY
    string internal constant BASE = "https://gamer-id.vercel.app/api/nft/";
    string internal constant TOP6 =
        '[{"t":"Halo Infinite","p":"xbox"},{"t":"Elden Ring","p":"steam"},{"t":"Hades","p":"steam"},{"t":"Celeste","p":"steam"},{"t":"Bloodborne","p":"psn"},{"t":"Fortnite","p":"epic"}]';

    event Locked(uint256 tokenId);
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    function setUp() public {
        signer = vm.addr(signerKey);
        card = new GamerIDCard(owner, signer, payout, MIN_PRICE, BASE);
        usdc = new MockUSDC();
        vm.prank(owner);
        card.setRefresher(refresher);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // ------------------------------------------------------------------ helpers

    function _keys(uint256 n, uint256 salt) internal pure returns (bytes32[] memory k) {
        k = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            k[i] = keccak256(abi.encode("acct", salt, i));
        }
    }

    function _voucher(address to, bytes32[] memory keys) internal view returns (GamerIDCard.MintVoucher memory v) {
        v = GamerIDCard.MintVoucher({
            to: to,
            top6Hash: keccak256(bytes(TOP6)),
            accountKeys: keys,
            payToken: address(0),
            price: PRICE,
            nonce: card.mintNonce(to),
            deadline: block.timestamp + 10 minutes
        });
    }

    function _digest(GamerIDCard.MintVoucher memory v) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                card.MINT_VOUCHER_TYPEHASH(),
                v.to,
                v.top6Hash,
                keccak256(abi.encodePacked(v.accountKeys)),
                v.payToken,
                v.price,
                v.nonce,
                v.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", card.domainSeparator(), structHash));
    }

    function _sign(GamerIDCard.MintVoucher memory v, uint256 key) internal view returns (bytes memory) {
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(key, _digest(v));
        return abi.encodePacked(r, s, vv);
    }

    function _mintAs(address payer, GamerIDCard.MintVoucher memory v) internal returns (uint256) {
        bytes memory sig = _sign(v, signerKey);
        vm.prank(payer);
        return card.mint{value: v.payToken == address(0) ? v.price : 0}(v, TOP6, sig);
    }

    function _mintAlice() internal returns (uint256) {
        return _mintAs(alice, _voucher(alice, _keys(2, 1)));
    }

    // ------------------------------------------------------------------ deployment / metadata

    function test_constructorState() public view {
        assertEq(card.name(), "GAMER.ID Card");
        assertEq(card.symbol(), "GAMERID");
        assertEq(card.owner(), owner);
        assertEq(card.voucherSigner(), signer);
        assertEq(card.payoutAddress(), payout);
        assertEq(card.minPriceWei(), MIN_PRICE);
        assertEq(card.baseURI(), BASE);
        assertEq(card.totalMinted(), 0);
        assertEq(card.totalSupply(), 0);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(GamerIDCard.ZeroAddress.selector);
        new GamerIDCard(owner, address(0), payout, MIN_PRICE, BASE);
        vm.expectRevert(GamerIDCard.ZeroAddress.selector);
        new GamerIDCard(owner, signer, payable(address(0)), MIN_PRICE, BASE);
    }

    function test_supportsInterfaces() public view {
        assertTrue(card.supportsInterface(0xb45a3c0e)); // ERC-5192
        assertTrue(card.supportsInterface(0x49064906)); // ERC-4906
        assertTrue(card.supportsInterface(type(IERC721).interfaceId));
        assertTrue(card.supportsInterface(type(IERC721Metadata).interfaceId));
        assertTrue(card.supportsInterface(type(IERC165).interfaceId));
        assertFalse(card.supportsInterface(0xffffffff));
    }

    function test_mintHappyPath() public {
        bytes32[] memory keys = _keys(3, 7);
        GamerIDCard.MintVoucher memory v = _voucher(alice, keys);
        bytes memory sig = _sign(v, signerKey);

        vm.expectEmit(true, true, true, true, address(card));
        emit IERC721.Transfer(address(0), alice, 1);
        vm.expectEmit(false, false, false, true, address(card));
        emit Locked(1);

        vm.prank(alice);
        uint256 id = card.mint{value: PRICE}(v, TOP6, sig);

        assertEq(id, 1);
        assertEq(card.ownerOf(1), alice);
        assertEq(card.balanceOf(alice), 1);
        assertEq(card.tokenOf(alice), 1);
        assertEq(card.mintNonce(alice), 1);
        assertTrue(card.locked(1));
        assertEq(card.tokenURI(1), string.concat(BASE, "1"));
        assertEq(address(card).balance, PRICE);
        assertEq(card.totalMinted(), 1);
        assertEq(card.totalSupply(), 1);

        (bytes32 top6Hash, uint64 mintedAt, bytes32[] memory stored) = card.cardOf(1);
        assertEq(top6Hash, keccak256(bytes(TOP6)));
        assertEq(mintedAt, uint64(block.timestamp));
        assertEq(stored.length, 3);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(stored[i], keys[i]);
            assertEq(card.accountCard(keys[i]), 1);
        }
    }

    function test_mintEmitsCardMintedWithTop6Json() public {
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        bytes memory sig = _sign(v, signerKey);
        vm.expectEmit(true, true, true, true, address(card));
        emit GamerIDCard.CardMinted(1, alice, alice, v.top6Hash, TOP6, v.accountKeys, address(0), PRICE);
        vm.prank(alice);
        card.mint{value: PRICE}(v, TOP6, sig);
    }

    function test_thirdPartyCanPayForRecipient() public {
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        uint256 bobBefore = bob.balance;
        _mintAs(bob, v);
        assertEq(card.ownerOf(1), alice);
        assertEq(card.balanceOf(bob), 0);
        assertEq(bob.balance, bobBefore - PRICE);
    }

    function test_mintWithZeroAccounts() public {
        _mintAs(alice, _voucher(alice, new bytes32[](0)));
        (,, bytes32[] memory stored) = card.cardOf(1);
        assertEq(stored.length, 0);
    }

    function test_tokenURIAndLockedRevertForUnknownToken() public {
        vm.expectRevert();
        card.tokenURI(99);
        vm.expectRevert();
        card.locked(99);
        vm.expectRevert();
        card.cardOf(99);
    }

    // ------------------------------------------------------------------ soulbound

    function test_transfersRevert() public {
        _mintAlice();
        vm.startPrank(alice);
        vm.expectRevert(GamerIDCard.Soulbound.selector);
        card.transferFrom(alice, bob, 1);
        vm.expectRevert(GamerIDCard.Soulbound.selector);
        card.safeTransferFrom(alice, bob, 1);
        vm.expectRevert(GamerIDCard.Soulbound.selector);
        card.safeTransferFrom(alice, bob, 1, "");
        vm.expectRevert(GamerIDCard.Soulbound.selector);
        card.approve(bob, 1);
        vm.expectRevert(GamerIDCard.Soulbound.selector);
        card.setApprovalForAll(bob, true);
        vm.stopPrank();
        assertEq(card.ownerOf(1), alice);
    }

    function testFuzz_soulboundAgainstAnyCallerAndRecipient(address caller, address to) public {
        vm.assume(to != address(0));
        _mintAlice();
        vm.prank(caller);
        vm.expectRevert();
        card.transferFrom(alice, to, 1);
        assertEq(card.ownerOf(1), alice);
        assertEq(card.getApproved(1), address(0));
    }

    // ------------------------------------------------------------------ one per wallet / nonce

    function test_oneCardPerWallet() public {
        _mintAlice();
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 99));
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GamerIDCard.AlreadyHasCard.selector, alice));
        card.mint{value: PRICE}(v, TOP6, sig);
    }

    function test_voucherCannotBeReplayedAfterBurn() public {
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        card.mint{value: PRICE}(v, TOP6, sig);
        vm.prank(alice);
        card.burn(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GamerIDCard.BadNonce.selector, 1, 0));
        card.mint{value: PRICE}(v, TOP6, sig);
    }

    function test_burnFreesWalletAndAccounts() public {
        bytes32[] memory keys = _keys(2, 1);
        _mintAs(alice, _voucher(alice, keys));
        vm.prank(alice);
        card.burn(1);
        assertEq(card.balanceOf(alice), 0);
        assertEq(card.tokenOf(alice), 0);
        assertEq(card.accountCard(keys[0]), 0);
        assertEq(card.accountCard(keys[1]), 0);
        assertEq(card.totalMinted(), 1);
        assertEq(card.totalSupply(), 0);
        // the same accounts can now back a card in another wallet, and alice can mint again (new id)
        _mintAs(bob, _voucher(bob, keys));
        assertEq(card.accountCard(keys[0]), 2);
        uint256 id = _mintAs(alice, _voucher(alice, _keys(1, 5)));
        assertEq(id, 3);
    }

    function test_onlyOwnerCanBurn() public {
        _mintAlice();
        vm.prank(bob);
        vm.expectRevert(GamerIDCard.NotAuthorized.selector);
        card.burn(1);
        vm.prank(owner);
        vm.expectRevert(GamerIDCard.NotAuthorized.selector);
        card.burn(1);
    }

    function testFuzz_wrongNonceRejected(uint256 nonce) public {
        vm.assume(nonce != 0);
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        v.nonce = nonce;
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GamerIDCard.BadNonce.selector, 0, nonce));
        card.mint{value: PRICE}(v, TOP6, sig);
    }

    // ------------------------------------------------------------------ signature / deadline / top6

    function testFuzz_rejectsForeignSigner(uint256 key) public {
        key = bound(key, 1, 115792089237316195423570985008687907852837564279074904382605163141518161494336);
        vm.assume(key != signerKey);
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        bytes memory sig = _sign(v, key);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.InvalidSignature.selector);
        card.mint{value: PRICE}(v, TOP6, sig);
    }

    function test_rejectsMalformedSignature() public {
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.InvalidSignature.selector);
        card.mint{value: PRICE}(v, TOP6, hex"1234");
    }

    function test_tamperedVoucherFieldsRejected() public {
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(2, 1));
        bytes memory sig = _sign(v, signerKey);

        GamerIDCard.MintVoucher memory t = _voucher(alice, _keys(2, 1));
        t.to = bob;
        t.nonce = 0;
        vm.prank(bob);
        vm.expectRevert(GamerIDCard.InvalidSignature.selector);
        card.mint{value: PRICE}(t, TOP6, sig);

        t = _voucher(alice, _keys(2, 2)); // different accounts
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.InvalidSignature.selector);
        card.mint{value: PRICE}(t, TOP6, sig);

        t = _voucher(alice, _keys(2, 1));
        t.price = MIN_PRICE; // cheaper than quoted
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.InvalidSignature.selector);
        card.mint{value: MIN_PRICE}(t, TOP6, sig);

        t = _voucher(alice, _keys(2, 1));
        t.deadline += 1;
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.InvalidSignature.selector);
        card.mint{value: PRICE}(t, TOP6, sig);
    }

    function testFuzz_deadline(uint256 warpBy) public {
        warpBy = bound(warpBy, 0, 365 days);
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        bytes memory sig = _sign(v, signerKey);
        vm.warp(block.timestamp + warpBy);
        vm.prank(alice);
        if (warpBy > 10 minutes) {
            vm.expectRevert(GamerIDCard.VoucherExpired.selector);
            card.mint{value: PRICE}(v, TOP6, sig);
        } else {
            card.mint{value: PRICE}(v, TOP6, sig);
            assertEq(card.ownerOf(1), alice);
        }
    }

    function testFuzz_top6MustMatchCommittedHash(string memory other) public {
        vm.assume(keccak256(bytes(other)) != keccak256(bytes(TOP6)));
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.Top6Mismatch.selector);
        card.mint{value: PRICE}(v, other, sig);
    }

    function test_zeroRecipientRejected() public {
        GamerIDCard.MintVoucher memory v = _voucher(address(0), _keys(1, 1));
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.ZeroAddress.selector);
        card.mint{value: PRICE}(v, TOP6, sig);
    }

    // ------------------------------------------------------------------ price

    function testFuzz_nativePaymentMustEqualQuote(uint256 paid) public {
        paid = bound(paid, 0, 5 ether);
        vm.assume(paid != PRICE);
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.BadPayment.selector);
        card.mint{value: paid}(v, TOP6, sig);
    }

    function testFuzz_quoteBelowFloorRejectedEvenIfSigned(uint256 price) public {
        price = bound(price, 0, MIN_PRICE - 1);
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        v.price = price;
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.PriceBelowFloor.selector);
        card.mint{value: price}(v, TOP6, sig);
    }

    function testFuzz_anyQuoteAtOrAboveFloorAccepted(uint256 price) public {
        price = bound(price, MIN_PRICE, 5 ether);
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        v.price = price;
        _mintAs(alice, v);
        assertEq(address(card).balance, price);
    }

    function test_erc20Payment() public {
        vm.prank(owner);
        card.setTokenMinPrice(address(usdc), 4_500_000);
        usdc.mint(alice, 10_000_000);

        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        v.payToken = address(usdc);
        v.price = 5_000_000;
        bytes memory sig = _sign(v, signerKey);

        vm.startPrank(alice);
        usdc.approve(address(card), 5_000_000);
        card.mint(v, TOP6, sig);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(card)), 5_000_000);
        assertEq(card.ownerOf(1), alice);
    }

    function test_erc20PaymentRules() public {
        usdc.mint(alice, 10_000_000);
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        v.payToken = address(usdc);
        v.price = 5_000_000;
        bytes memory sig = _sign(v, signerKey);

        vm.startPrank(alice);
        usdc.approve(address(card), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(GamerIDCard.TokenNotAccepted.selector, address(usdc)));
        card.mint(v, TOP6, sig);
        vm.stopPrank();

        vm.prank(owner);
        card.setTokenMinPrice(address(usdc), 6_000_000);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.PriceBelowFloor.selector);
        card.mint(v, TOP6, sig);

        vm.prank(owner);
        card.setTokenMinPrice(address(usdc), 5_000_000);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.BadPayment.selector); // native value sent with a token voucher
        card.mint{value: 1}(v, TOP6, sig);

        vm.prank(alice);
        card.mint(v, TOP6, sig);
        assertEq(card.ownerOf(1), alice);
    }

    function test_erc20PaymentWithoutAllowanceReverts() public {
        vm.prank(owner);
        card.setTokenMinPrice(address(usdc), 5_000_000);
        usdc.mint(alice, 10_000_000);
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        v.payToken = address(usdc);
        v.price = 5_000_000;
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert();
        card.mint(v, TOP6, sig);
        assertEq(card.balanceOf(alice), 0);
        assertEq(card.tokenOf(alice), 0);
    }

    function test_plainTransfersRefused() public {
        vm.prank(alice);
        (bool ok,) = address(card).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ------------------------------------------------------------------ account claims

    function test_accountCanOnlyBackOneCard() public {
        bytes32[] memory keys = _keys(2, 1);
        _mintAs(alice, _voucher(alice, keys));

        bytes32[] memory overlap = new bytes32[](2);
        overlap[0] = keccak256("fresh");
        overlap[1] = keys[1];
        GamerIDCard.MintVoucher memory v = _voucher(bob, overlap);
        bytes memory sig = _sign(v, signerKey);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GamerIDCard.AccountAlreadyLinked.selector, keys[1], 1));
        card.mint{value: PRICE}(v, TOP6, sig);
        assertEq(card.accountCard(overlap[0]), 0, "no partial claim");
    }

    function test_duplicateAccountInOneVoucherRejected() public {
        bytes32[] memory keys = new bytes32[](2);
        keys[0] = keccak256("same");
        keys[1] = keccak256("same");
        GamerIDCard.MintVoucher memory v = _voucher(alice, keys);
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GamerIDCard.DuplicateAccount.selector, keys[0]));
        card.mint{value: PRICE}(v, TOP6, sig);
    }

    function test_tooManyAccountsRejected() public {
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(9, 1));
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.TooManyAccounts.selector);
        card.mint{value: PRICE}(v, TOP6, sig);
    }

    function testFuzz_accountClaims(uint8 nA, uint8 nB, bool overlap) public {
        nA = uint8(bound(nA, 0, 8));
        nB = uint8(bound(nB, 1, 8));
        bytes32[] memory a = _keys(nA, 1);
        bytes32[] memory b = _keys(nB, 2);
        if (overlap && nA > 0) b[nB - 1] = a[0];
        _mintAs(alice, _voucher(alice, a));

        GamerIDCard.MintVoucher memory v = _voucher(bob, b);
        bytes memory sig = _sign(v, signerKey);
        vm.prank(bob);
        if (overlap && nA > 0) {
            vm.expectRevert(abi.encodeWithSelector(GamerIDCard.AccountAlreadyLinked.selector, a[0], 1));
            card.mint{value: PRICE}(v, TOP6, sig);
        } else {
            card.mint{value: PRICE}(v, TOP6, sig);
            for (uint256 i = 0; i < nB; i++) {
                assertEq(card.accountCard(b[i]), 2);
            }
        }
        for (uint256 i = 0; i < nA; i++) {
            assertEq(card.accountCard(a[i]), 1);
        }
    }

    // ------------------------------------------------------------------ pause

    function test_pauseBlocksMint() public {
        vm.prank(owner);
        card.pause();
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        card.mint{value: PRICE}(v, TOP6, sig);

        vm.prank(owner);
        card.unpause();
        vm.prank(alice);
        card.mint{value: PRICE}(v, TOP6, sig);
        assertEq(card.ownerOf(1), alice);
    }

    function test_burnStillWorksWhilePaused() public {
        _mintAlice();
        vm.prank(owner);
        card.pause();
        vm.prank(alice);
        card.burn(1);
        assertEq(card.balanceOf(alice), 0);
    }

    function testFuzz_onlyOwnerCanPause(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        card.pause();
    }

    // ------------------------------------------------------------------ withdraw

    function test_withdrawSendsEverythingToPayout() public {
        _mintAlice();
        _mintAs(bob, _voucher(bob, _keys(1, 2)));
        vm.prank(owner);
        card.withdraw();
        assertEq(payout.balance, 2 * PRICE);
        assertEq(address(card).balance, 0);
    }

    function test_withdrawWithNothingReverts() public {
        vm.prank(owner);
        vm.expectRevert(GamerIDCard.NothingToWithdraw.selector);
        card.withdraw();
    }

    function testFuzz_onlyOwnerCanWithdraw(address caller) public {
        vm.assume(caller != owner);
        _mintAlice();
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        card.withdraw();
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        card.withdrawToken(address(usdc));
    }

    function test_withdrawToRejectingPayoutReverts() public {
        _mintAlice();
        RejectingPayout r = new RejectingPayout();
        vm.prank(owner);
        card.setPayoutAddress(payable(address(r)));
        vm.prank(owner);
        vm.expectRevert(GamerIDCard.TransferFailed.selector);
        card.withdraw();
        assertEq(address(card).balance, PRICE);
    }

    function test_withdrawCannotBeReentered() public {
        _mintAlice();
        ReenteringPayout r = new ReenteringPayout();
        r.setCard(card);
        vm.startPrank(owner);
        card.setPayoutAddress(payable(address(r)));
        card.transferOwnership(address(r));
        vm.stopPrank();
        vm.prank(address(r));
        card.acceptOwnership();
        vm.prank(address(r));
        card.withdraw();
        assertTrue(r.attempted());
        assertFalse(r.reentrySucceeded());
        assertEq(address(r).balance, PRICE);
    }

    function test_withdrawToken() public {
        vm.prank(owner);
        card.setTokenMinPrice(address(usdc), 5_000_000);
        usdc.mint(alice, 5_000_000);
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        v.payToken = address(usdc);
        v.price = 5_000_000;
        bytes memory sig = _sign(v, signerKey);
        vm.startPrank(alice);
        usdc.approve(address(card), 5_000_000);
        card.mint(v, TOP6, sig);
        vm.stopPrank();
        vm.prank(owner);
        card.withdrawToken(address(usdc));
        assertEq(usdc.balanceOf(payout), 5_000_000);
        vm.prank(owner);
        vm.expectRevert(GamerIDCard.NothingToWithdraw.selector);
        card.withdrawToken(address(usdc));
    }

    // ------------------------------------------------------------------ admin + ERC-4906

    function test_adminSetters() public {
        address newSigner = makeAddr("newSigner");
        vm.startPrank(owner);
        card.setVoucherSigner(newSigner);
        card.setMinPriceWei(1 ether);
        card.setPayoutAddress(payable(bob));
        card.setRefresher(address(0));
        vm.expectRevert(GamerIDCard.ZeroAddress.selector);
        card.setVoucherSigner(address(0));
        vm.expectRevert(GamerIDCard.ZeroAddress.selector);
        card.setPayoutAddress(payable(address(0)));
        vm.expectRevert(GamerIDCard.ZeroAddress.selector);
        card.setTokenMinPrice(address(0), 1);
        vm.stopPrank();
        assertEq(card.voucherSigner(), newSigner);
        assertEq(card.minPriceWei(), 1 ether);
        assertEq(card.payoutAddress(), bob);
        assertEq(card.refresher(), address(0));

        // vouchers from the old signer stop working immediately
        GamerIDCard.MintVoucher memory v = _voucher(alice, _keys(1, 1));
        v.price = 1 ether;
        bytes memory sig = _sign(v, signerKey);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.InvalidSignature.selector);
        card.mint{value: 1 ether}(v, TOP6, sig);
    }

    function testFuzz_onlyOwnerAdmin(address caller) public {
        vm.assume(caller != owner);
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller);
        vm.startPrank(caller);
        vm.expectRevert(err);
        card.setVoucherSigner(caller);
        vm.expectRevert(err);
        card.setMinPriceWei(0);
        vm.expectRevert(err);
        card.setPayoutAddress(payable(caller));
        vm.expectRevert(err);
        card.setBaseURI("https://evil.example/");
        vm.expectRevert(err);
        card.setTokenMinPrice(address(usdc), 1);
        vm.expectRevert(err);
        card.setRefresher(caller);
        vm.stopPrank();
    }

    function test_setBaseURIEmitsBatchUpdate() public {
        _mintAlice();
        _mintAs(bob, _voucher(bob, _keys(1, 2)));
        vm.expectEmit(false, false, false, true, address(card));
        emit BatchMetadataUpdate(1, 2);
        vm.prank(owner);
        card.setBaseURI("https://preview.example/api/nft/");
        assertEq(card.tokenURI(2), "https://preview.example/api/nft/2");
    }

    function test_refreshByOwnerAndRefresherOnly() public {
        _mintAlice();
        vm.expectEmit(false, false, false, true, address(card));
        emit MetadataUpdate(1);
        vm.prank(refresher);
        card.refreshMetadata(1);

        vm.expectEmit(false, false, false, true, address(card));
        emit BatchMetadataUpdate(1, 10);
        vm.prank(owner);
        card.refreshMetadataRange(1, 10);

        vm.prank(alice); // the card holder cannot spam refresh events
        vm.expectRevert(GamerIDCard.NotAuthorized.selector);
        card.refreshMetadata(1);
        vm.prank(alice);
        vm.expectRevert(GamerIDCard.NotAuthorized.selector);
        card.refreshMetadataRange(1, 1);

        vm.prank(refresher);
        vm.expectRevert();
        card.refreshMetadata(42); // unknown token
    }

    function test_ownershipIsTwoStep() public {
        vm.prank(owner);
        card.transferOwnership(bob);
        assertEq(card.owner(), owner);
        assertEq(card.pendingOwner(), bob);
        vm.prank(bob);
        card.acceptOwnership();
        assertEq(card.owner(), bob);
    }

    // ------------------------------------------------------------------ holder export

    function test_holderExportViews() public {
        address[5] memory wallets = [alice, bob, makeAddr("c"), makeAddr("d"), makeAddr("e")];
        for (uint256 i = 0; i < wallets.length; i++) {
            _mintAs(alice, _voucher(wallets[i], _keys(1, 100 + i)));
        }
        vm.prank(wallets[2]);
        card.burn(3);
        assertEq(card.totalMinted(), 5);
        assertEq(card.totalSupply(), 4);
        uint256 live;
        for (uint256 id = 1; id <= card.totalMinted(); id++) {
            try card.ownerOf(id) returns (address o) {
                assertEq(card.tokenOf(o), id);
                live++;
            } catch {}
        }
        assertEq(live, 4);
    }
}
