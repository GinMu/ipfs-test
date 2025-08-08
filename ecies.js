import { PrivateKey, utils, PublicKey } from "eciesjs";
import { concatBytes } from "@noble/ciphers/utils";

export const SECRET_KEY_LENGTH = 32;
export const COMPRESSED_PUBLIC_KEY_SIZE = 33;
export const UNCOMPRESSED_PUBLIC_KEY_SIZE = 65;
export const ETH_PUBLIC_KEY_SIZE = 64;
export const CURVE25519_PUBLIC_KEY_SIZE = 32;

// symmetric
export const XCHACHA20_NONCE_LENGTH = 24;
export const AEAD_TAG_LENGTH = 16;

export const ephemeralKeySize = (curve) => {
  const mapping = {
    secp256k1: UNCOMPRESSED_PUBLIC_KEY_SIZE,
    x25519: CURVE25519_PUBLIC_KEY_SIZE,
    ed25519: CURVE25519_PUBLIC_KEY_SIZE
  };

  if (curve in mapping) {
    return mapping[curve];
  } /* v8 ignore next 2 */ else {
    throw new Error("Not implemented");
  }
};

export const encrypt = async ({ publicKey, data, curve }) => {
  const ephemeralSK = new PrivateKey(undefined, curve);

  const receiverPK =
    publicKey instanceof Uint8Array ? new PublicKey(publicKey, curve) : PublicKey.fromHex(publicKey, curve);

  const sharedKey = ephemeralSK.encapsulate(receiverPK, false);
  const ephemeralPK = ephemeralSK.publicKey.toBytes(false);

  const encrypted = utils.symEncrypt(sharedKey, data);
  return concatBytes(ephemeralPK, encrypted);
};

export const decrypt = async ({ data, curve, privateKey }) => {
  const receiverSK =
    privateKey instanceof Uint8Array ? new PrivateKey(privateKey, curve) : PrivateKey.fromHex(privateKey, curve);

  const keySize = ephemeralKeySize(curve);
  const ephemeralPK = new PublicKey(data.subarray(0, keySize), curve);
  const encrypted = data.subarray(keySize);
  const sharedKey = ephemeralPK.decapsulate(receiverSK, false);
  return utils.symDecrypt(sharedKey, encrypted);
};
