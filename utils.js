import { peerIdFromPrivateKey, peerIdFromPublicKey } from "@libp2p/peer-id";
import { base36 } from "multiformats/bases/base36";

export const getIPNSNameFromKeypair = (privateKey) => {
  if (!privateKey) return "";
  return peerIdFromPrivateKey(privateKey).toCID().toString(base36);
};

export const getIPNSNameFromPublicKey = (publicKey) => {
  return peerIdFromPublicKey(publicKey).toCID().toString(base36);
};
