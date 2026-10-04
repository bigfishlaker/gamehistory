// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice ERC-5192 minimal soulbound interface (https://eips.ethereum.org/EIPS/eip-5192).
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/// @title GAMER.ID Card
/// @notice One soulbound (ERC-5192) gamer ID card per wallet. The card's Top 6 is chosen at mint,
/// committed in a server-signed EIP-712 voucher and stored on-chain forever (hash in storage, the
/// canonical JSON in the CardMinted event). Hours, games and tier are dynamic and served by the
/// GAMER.ID metadata API; the owner or the refresher can emit ERC-4906 events when they change.
/// Each game account (an HMAC key computed by the server, never a raw ID) can back one card at a time.
contract GamerIDCard is ERC721, EIP712, Ownable2Step, Pausable, ReentrancyGuard, IERC5192, IERC4906 {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    /// @dev EIP-165 id of ERC-5192.
    bytes4 private constant ERC5192_INTERFACE_ID = 0xb45a3c0e;
    /// @dev EIP-165 id of ERC-4906 (events only, so the id is fixed by the EIP).
    bytes4 private constant ERC4906_INTERFACE_ID = 0x49064906;
    /// @dev Upper bound on linked game accounts per card (keeps gas and calldata bounded).
    uint256 public constant MAX_ACCOUNTS = 8;

    bytes32 public constant MINT_VOUCHER_TYPEHASH = keccak256(
        "MintVoucher(address to,bytes32 top6Hash,bytes32 accountsHash,address payToken,uint256 price,uint256 nonce,uint256 deadline)"
    );

    /// @notice Signed by the GAMER.ID server after it checked the SIWE session, the account rules
    /// and the price quote. `to` receives the card; anyone may pay for it.
    struct MintVoucher {
        address to;
        bytes32 top6Hash; // keccak256 of the canonical Top 6 JSON passed to mint()
        bytes32[] accountKeys; // HMAC-SHA256 keys of the linked game accounts
        address payToken; // address(0) = native gas token, otherwise an accepted ERC-20
        uint256 price; // exact amount to pay (wei or token base units)
        uint256 nonce; // must equal mintNonce[to]
        uint256 deadline; // unix seconds
    }

    struct Card {
        bytes32 top6Hash;
        uint64 mintedAt;
        uint8 accountCount;
    }

    // --- configuration -------------------------------------------------------------------------
    address public voucherSigner;
    address public refresher;
    address payable public payoutAddress;
    /// @notice Floor for native-token payments; guards against a bad quote or a leaked signer key.
    uint256 public minPriceWei;
    /// @notice Accepted ERC-20s and their floor (0 = not accepted).
    mapping(address token => uint256 floor) public tokenMinPrice;
    string private _baseTokenURI;

    // --- state ---------------------------------------------------------------------------------
    uint256 private _nextTokenId = 1;
    uint256 private _burned;
    mapping(address owner => uint256 tokenId) public tokenOf;
    mapping(address owner => uint256 nonce) public mintNonce;
    mapping(uint256 tokenId => Card) private _cards;
    mapping(uint256 tokenId => bytes32[]) private _cardAccounts;
    /// @notice Which card currently holds a game account key (0 = free).
    mapping(bytes32 accountKey => uint256 tokenId) public accountCard;

    // --- events --------------------------------------------------------------------------------
    event CardMinted(
        uint256 indexed tokenId,
        address indexed to,
        address indexed payer,
        bytes32 top6Hash,
        string top6Json,
        bytes32[] accountKeys,
        address payToken,
        uint256 price
    );
    event CardBurned(uint256 indexed tokenId, address indexed owner);
    event VoucherSignerUpdated(address indexed signer);
    event RefresherUpdated(address indexed refresher);
    event PayoutAddressUpdated(address indexed payout);
    event MinPriceUpdated(uint256 minPriceWei);
    event TokenMinPriceUpdated(address indexed token, uint256 minPrice);
    event BaseURIUpdated(string baseURI);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    // --- errors --------------------------------------------------------------------------------
    error Soulbound();
    error AlreadyHasCard(address owner);
    error InvalidSignature();
    error VoucherExpired();
    error BadNonce(uint256 expected, uint256 got);
    error BadPayment();
    error PriceBelowFloor();
    error TokenNotAccepted(address token);
    error Top6Mismatch();
    error TooManyAccounts();
    error AccountAlreadyLinked(bytes32 accountKey, uint256 tokenId);
    error DuplicateAccount(bytes32 accountKey);
    error NotAuthorized();
    error ZeroAddress();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(
        address initialOwner,
        address signer,
        address payable payout,
        uint256 minPriceWei_,
        string memory baseURI_
    ) ERC721("GAMER.ID Card", "GAMERID") EIP712("GamerIDCard", "1") Ownable(initialOwner) {
        if (signer == address(0) || payout == address(0)) revert ZeroAddress();
        voucherSigner = signer;
        payoutAddress = payout;
        minPriceWei = minPriceWei_;
        _baseTokenURI = baseURI_;
        emit VoucherSignerUpdated(signer);
        emit PayoutAddressUpdated(payout);
        emit MinPriceUpdated(minPriceWei_);
        emit BaseURIUpdated(baseURI_);
    }

    // =========================================================================================
    // Minting
    // =========================================================================================

    /// @notice Mint the card described by a server-signed voucher.
    /// @param v The voucher. `v.to` gets the card; `msg.sender` pays.
    /// @param top6Json Canonical JSON of the Top 6; keccak256 must equal `v.top6Hash`.
    /// @param signature EIP-712 signature by `voucherSigner`.
    function mint(MintVoucher calldata v, string calldata top6Json, bytes calldata signature)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId)
    {
        _verifyVoucher(v, top6Json, signature);
        tokenId = _recordCard(v);
        // _mint (not _safeMint): no receiver callback, so there is no reentry point. The only external
        // call (ERC-20 transferFrom) happens last, so the event ordering lints below are false positives.
        // forge-lint: disable-next-line(unsafe-oz-erc721-mint)
        _mint(v.to, tokenId);
        // forge-lint: disable-next-line(reentrancy-events)
        emit Locked(tokenId);
        _emitMinted(tokenId, v, top6Json, msg.sender);
        // Payment last (checks-effects-interactions); a failed payment reverts the whole mint.
        _collectPayment(msg.sender, v.payToken, v.price);
    }

    /// @notice Relayed mint for wallets that can only send zero-value, low-gas calls (for example a
    ///         Grotto embedded wallet behind the game transaction relay). `v.to` first approves
    ///         `v.price` of `v.payToken` to this contract; anyone may then submit the voucher, and the
    ///         token is pulled from `v.to`, never from `msg.sender`. Native-currency vouchers are refused.
    /// @dev Front-running is harmless: the only possible outcome is the card `v.to` asked for, at the
    ///      server-quoted price `v.to` approved.
    function mintWithAllowance(MintVoucher calldata v, string calldata top6Json, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId)
    {
        if (v.payToken == address(0)) revert BadPayment();
        _verifyVoucher(v, top6Json, signature);
        tokenId = _recordCard(v);
        // forge-lint: disable-next-line(unsafe-oz-erc721-mint)
        _mint(v.to, tokenId);
        // forge-lint: disable-next-line(reentrancy-events)
        emit Locked(tokenId);
        _emitMinted(tokenId, v, top6Json, v.to);
        _collectPayment(v.to, v.payToken, v.price);
    }

    function _verifyVoucher(MintVoucher calldata v, string calldata top6Json, bytes calldata signature)
        private
        view
    {
        // Deadlines are minutes long, so a few seconds of timestamp drift do not matter.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > v.deadline) revert VoucherExpired();
        if (v.to == address(0)) revert ZeroAddress();
        if (tokenOf[v.to] != 0) revert AlreadyHasCard(v.to);
        if (v.nonce != mintNonce[v.to]) revert BadNonce(mintNonce[v.to], v.nonce);
        if (keccak256(bytes(top6Json)) != v.top6Hash) revert Top6Mismatch();
        if (v.accountKeys.length > MAX_ACCOUNTS) revert TooManyAccounts();
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(hashVoucher(v), signature);
        if (err != ECDSA.RecoverError.NoError || recovered != voucherSigner) revert InvalidSignature();
    }

    function _recordCard(MintVoucher calldata v) private returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        mintNonce[v.to] = v.nonce + 1;
        tokenOf[v.to] = tokenId;
        // Both casts are safe: timestamps fit in 64 bits and accountKeys.length <= MAX_ACCOUNTS (8).
        _cards[tokenId] = Card({
            top6Hash: v.top6Hash,
            // forge-lint: disable-next-line(unsafe-typecast)
            mintedAt: uint64(block.timestamp),
            // forge-lint: disable-next-line(unsafe-typecast)
            accountCount: uint8(v.accountKeys.length)
        });
        _claimAccounts(tokenId, v.accountKeys);
    }

    function _emitMinted(uint256 tokenId, MintVoucher calldata v, string calldata top6Json, address payer)
        private
    {
        // forge-lint: disable-next-line(reentrancy-events)
        emit CardMinted(tokenId, v.to, payer, v.top6Hash, top6Json, v.accountKeys, v.payToken, v.price);
    }

    /// @notice Owner of a card may burn it. This frees its game accounts and lets the wallet mint again.
    function burn(uint256 tokenId) external nonReentrant {
        address owner = ownerOf(tokenId);
        if (owner != msg.sender) revert NotAuthorized();
        bytes32[] storage keys = _cardAccounts[tokenId];
        for (uint256 i = 0; i < keys.length; ++i) {
            delete accountCard[keys[i]];
        }
        delete _cardAccounts[tokenId];
        delete _cards[tokenId];
        delete tokenOf[owner];
        unchecked {
            ++_burned;
        }
        _burn(tokenId);
        emit CardBurned(tokenId, owner);
    }

    function _collectPayment(address payer, address payToken, uint256 price) private {
        if (payToken == address(0)) {
            if (price < minPriceWei) revert PriceBelowFloor();
            if (msg.value != price) revert BadPayment();
        } else {
            if (msg.value != 0) revert BadPayment();
            uint256 floor = tokenMinPrice[payToken];
            if (floor == 0) revert TokenNotAccepted(payToken);
            if (price < floor) revert PriceBelowFloor();
            // `payer` is msg.sender (mint) or v.to (mintWithAllowance): v.to's own approval plus a voucher
            // the server only signs for v.to's authenticated session, single-use via the nonce.
            // forge-lint: disable-next-line(arbitrary-send-erc20)
            IERC20(payToken).safeTransferFrom(payer, address(this), price);
        }
    }

    function _claimAccounts(uint256 tokenId, bytes32[] calldata keys) private {
        bytes32[] storage stored = _cardAccounts[tokenId];
        for (uint256 i = 0; i < keys.length; ++i) {
            bytes32 key = keys[i];
            uint256 holder = accountCard[key];
            // Reverting inside the loop is intended: any conflicting account rejects the whole mint.
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (holder == tokenId) revert DuplicateAccount(key);
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (holder != 0) revert AccountAlreadyLinked(key, holder);
            accountCard[key] = tokenId;
            stored.push(key);
        }
    }

    // =========================================================================================
    // Soulbinding (ERC-5192): only mint (from == 0) and burn (to == 0) move tokens.
    // =========================================================================================

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override(ERC721, IERC721) {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override(ERC721, IERC721) {
        revert Soulbound();
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    // =========================================================================================
    // Metadata
    // =========================================================================================

    function tokenURI(uint256 tokenId) public view override(ERC721) returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, tokenId.toString());
    }

    function baseURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    /// @notice Signal that a card's dynamic stats changed (ERC-4906). Owner or refresher only.
    function refreshMetadata(uint256 tokenId) external {
        if (msg.sender != owner() && msg.sender != refresher) revert NotAuthorized();
        _requireOwned(tokenId);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Signal that a range of cards changed (ERC-4906). Owner or refresher only.
    function refreshMetadataRange(uint256 fromTokenId, uint256 toTokenId) external {
        if (msg.sender != owner() && msg.sender != refresher) revert NotAuthorized();
        emit BatchMetadataUpdate(fromTokenId, toTokenId);
    }

    // =========================================================================================
    // Views (holder export friendly)
    // =========================================================================================

    function cardOf(uint256 tokenId)
        external
        view
        returns (bytes32 top6Hash, uint64 mintedAt, bytes32[] memory accountKeys)
    {
        _requireOwned(tokenId);
        Card memory c = _cards[tokenId];
        return (c.top6Hash, c.mintedAt, _cardAccounts[tokenId]);
    }

    /// @notice Highest token id minted so far (ids start at 1 and are never reused).
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice Cards currently in existence.
    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1 - _burned;
    }

    function hashVoucher(MintVoucher calldata v) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    MINT_VOUCHER_TYPEHASH,
                    v.to,
                    v.top6Hash,
                    keccak256(abi.encodePacked(v.accountKeys)),
                    v.payToken,
                    v.price,
                    v.nonce,
                    v.deadline
                )
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        return interfaceId == ERC5192_INTERFACE_ID || interfaceId == ERC4906_INTERFACE_ID
            || super.supportsInterface(interfaceId);
    }

    // =========================================================================================
    // Admin
    // =========================================================================================

    function setVoucherSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        voucherSigner = signer;
        emit VoucherSignerUpdated(signer);
    }

    /// @notice address(0) disables the refresher (the owner can still refresh).
    // forge-lint: disable-next-line(missing-zero-check)
    function setRefresher(address refresher_) external onlyOwner {
        refresher = refresher_;
        emit RefresherUpdated(refresher_);
    }

    function setPayoutAddress(address payable payout) external onlyOwner {
        if (payout == address(0)) revert ZeroAddress();
        payoutAddress = payout;
        emit PayoutAddressUpdated(payout);
    }

    function setMinPriceWei(uint256 minPriceWei_) external onlyOwner {
        minPriceWei = minPriceWei_;
        emit MinPriceUpdated(minPriceWei_);
    }

    /// @notice Accept an ERC-20 (e.g. bridged USDC) with a floor price; 0 stops accepting it.
    function setTokenMinPrice(address token, uint256 minPrice) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        tokenMinPrice[token] = minPrice;
        emit TokenMinPriceUpdated(token, minPrice);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
        if (_nextTokenId > 1) emit BatchMetadataUpdate(1, _nextTokenId - 1);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Send the whole native balance to the payout address.
    function withdraw() external nonReentrant onlyOwner {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToWithdraw();
        address payable to = payoutAddress;
        emit Withdrawn(address(0), to, amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Send the whole balance of an ERC-20 to the payout address.
    function withdrawToken(address token) external nonReentrant onlyOwner {
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert NothingToWithdraw();
        emit Withdrawn(token, payoutAddress, amount);
        IERC20(token).safeTransfer(payoutAddress, amount);
    }

    /// @dev Plain transfers are refused so that every payment goes through mint().
    receive() external payable {
        revert BadPayment();
    }
}
