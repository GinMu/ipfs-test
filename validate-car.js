/**
 * forked from https://github.com/storacha/ipfs-car
 */

import { CarIndexedReader } from "@ipld/car/indexed-reader";
import { recursive as exporter } from "ipfs-unixfs-exporter";
import { validateBlock } from "@web3-storage/car-block-validator";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { decode as blockDecode } from "multiformats/block";
import { pipeline } from "stream/promises";
import * as raw from "multiformats/codecs/raw";
import * as dagPb from "@ipld/dag-pb";
import * as dagCbor from "@ipld/dag-cbor";
import * as dagJson from "@ipld/dag-json";

export const Codecs = {
  [raw.code]: raw,
  [dagPb.code]: dagPb,
  [dagCbor.code]: dagCbor,
  [dagJson.code]: dagJson
};

const getRoots = async (reader, opts = {}) => {
  let roots = opts.root ? [CID.parse(opts.root)] : await reader.getRoots();
  if (!roots.length) {
    roots = await findImplicitRoots(reader.blocks());
  }
  if (roots.length > 1) {
    throw new Error("Multiple roots found, use --root to specify which one to use");
  }
  return roots;
};

const findImplicitRoots = async (blocks) => {
  const notRoots = new Set();
  const roots = new Set();

  for await (const { cid, bytes } of blocks) {
    if (!notRoots.has(cid.toString())) {
      roots.add(cid.toString());
    }

    const decoder = Codecs[cid.code];
    /* c8 ignore next 4 */
    if (!decoder) {
      throw new Error(`Missing decoder for codec: ${cid.code}`);
    }

    const block = await blockDecode({ bytes, codec: decoder, hasher: sha256 });
    for (const [, linkCID] of block.links()) {
      if (roots.has(linkCID.toString())) {
        roots.delete(linkCID.toString());
      }
      notRoots.add(cid.toString());
    }
  }

  return Array.from(roots).map((s) => CID.parse(s));
};

const validate = async (carPath, opts = {}) => {
  const reader = await CarIndexedReader.fromFile(carPath);
  const [root] = await getRoots(reader, opts);
  const entries = exporter(root, {
    async get(cid) {
      const block = await reader.get(cid);
      if (!block) {
        throw new Error(`Missing block: ${cid}`);
      }
      await validateBlock(block);
      return block.bytes;
    }
  });
  for await (const entry of entries) {
    const { type, content } = entry;
    if (type === "directory") {
      continue;
    }
    // file, raw, object, or identity
    await pipeline(content, async (source) => {
      let value = await source.next();
      while (!value.done) {
        value = await source.next();
      }
    });
  }
};

export default validate;
