import { keccak256, encodePacked, zeroAddress, type Address, type Hex } from 'viem';

/** EIP-712 domain/type of GamerIDCard vouchers. Must match MINT_VOUCHER_TYPEHASH in the contract. */
export const VOUCHER_DOMAIN_NAME = 'GamerIDCard';
export const VOUCHER_DOMAIN_VERSION = '1';

export const voucherTypes = {
  MintVoucher: [
    { name: 'to', type: 'address' },
    { name: 'top6Hash', type: 'bytes32' },
    { name: 'accountsHash', type: 'bytes32' },
    { name: 'payToken', type: 'address' },
    { name: 'price', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface MintVoucher {
  to: Address;
  top6Hash: Hex;
  accountKeys: Hex[];
  payToken: Address;
  price: bigint;
  nonce: bigint;
  deadline: bigint;
}

/** JSON-safe voucher (bigints as decimal strings) for API responses and the store. */
export interface MintVoucherJson {
  to: Address;
  top6Hash: Hex;
  accountKeys: Hex[];
  payToken: Address;
  price: string;
  nonce: string;
  deadline: string;
}

export const NATIVE_TOKEN = zeroAddress;

export function accountsHash(keys: Hex[]): Hex {
  return keccak256(keys.length ? encodePacked(keys.map(() => 'bytes32'), keys) : '0x');
}

export function voucherDomain(chainId: number, verifyingContract: Address) {
  return { name: VOUCHER_DOMAIN_NAME, version: VOUCHER_DOMAIN_VERSION, chainId, verifyingContract } as const;
}

export function voucherMessage(v: MintVoucher) {
  return {
    to: v.to,
    top6Hash: v.top6Hash,
    accountsHash: accountsHash(v.accountKeys),
    payToken: v.payToken,
    price: v.price,
    nonce: v.nonce,
    deadline: v.deadline,
  };
}

export function voucherToJson(v: MintVoucher): MintVoucherJson {
  return { ...v, price: v.price.toString(), nonce: v.nonce.toString(), deadline: v.deadline.toString() };
}

export function voucherFromJson(v: MintVoucherJson): MintVoucher {
  return { ...v, price: BigInt(v.price), nonce: BigInt(v.nonce), deadline: BigInt(v.deadline) };
}
