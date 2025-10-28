#!/usr/bin/env node

import {
  Secp256k1DidKeypair,
  getKeyDoc,
  DidService,
  SwtcDid,
  SwtcDidDocument,
  SwtcDidPublish,
  SwtcDidResolver,
  SwtcNftVC
} from "@jccdex/did";
import { IpfsClient } from "@jccdex/ipfs-rpc-client";
import { Keypairs } from "@swtc/keypairs";
import { Command } from "commander";
const program = new Command();

const client = new IpfsClient({
  baseURL: "https://wodecards.wh.jccdex.cn:8550"
});

const resolver = new SwtcDidResolver(client);
const publish = new SwtcDidPublish(client);
const key = "637674430F5F8736F3F86367F8393E00EF29603B6D82E62B1E4B3AC56F5A6478";
const kp = Keypairs.deriveKeypair(key);
const address = Keypairs.deriveAddress(kp.publicKey);
const ipns = "ipns://k2k4r8ntjlp1cmgped39eq1fi4yze6fsr8og1kcmjhamgs3ubwkfldei";
const did = SwtcDid.fromIdentifier(address);
const keypair = Secp256k1DidKeypair.fromPrivateKey(key);
const id = `${did.toString()}#key-1`;

const keyDoc = getKeyDoc(did.toString(), keypair.keypair(), "", id);

const publishDid = async () => {
  const didDoc = new SwtcDidDocument(did.toString());
  const profile = DidService.generateProfile({
    id: did.toString() + "#profile",
    nickname: "Alice",
    preferredAvatar: "https://example.com/avatar.png"
  });
  const ipfsStorage = DidService.generateIpfsStorage({
    id: did.toString() + "#ipfs-storage",
    ipns,
    previousCid: ""
  });

  const swtcVC = new SwtcNftVC();
  swtcVC.setSubject({
    id: did.toString(),
    chainId: 315,
    tokenName: "Golden Sands",
    tokenId: "64656E2053616E647320E98791E6B29900000000000000000000000000000066",
    owner: address,
    status: "Active"
  });

  await swtcVC.sign({
    keyDoc
  });

  didDoc
    .setVersion("1.0.0")
    .addAuthentication(id)
    .addAssertionMethod(id)
    .addVerificationMethod({
      id,
      type: keyDoc.type,
      controller: did.toString(),
      publicKeyBase58: keypair.base58PublicKey()
    })
    .addService(profile)
    .addService(ipfsStorage)
    .addService(
      DidService.generateSwtcNft({
        id: did.toString() + "#nft-golden-sands-1",
        standard: "jingtumNFT",
        tokenName: "Golden Sands",
        chainId: 315,
        tokenId: "64656E2053616E647320E98791E6B29900000000000000000000000000000066",
        status: "Active",
        credential: swtcVC.toJSON()
      })
    )
    .setUpdated();

  const res = await publish.upload(did.toString(), didDoc, key);
  console.log("Publish DID Result:", res);
};

const resolveDid = async () => {
  const resolved = await resolver.resolve(did.toString());
  console.log("Resolved DID Document:", JSON.stringify(resolved, null, 2));
};
const verifyVC = async () => {
  const resolved = await resolver.resolve(did.toString());
  const swtcNftService = resolved.service.find((s) => s.credential);

  const vc = SwtcNftVC.fromJSON(swtcNftService.credential);
  const verifyResult = await vc.verify({
    resolver
  });
  console.log("VC Verify Result:", JSON.stringify(verifyResult, null, 2));
};

program
  .name("test-did")
  .command("upload")
  .description("Publish DID Document to IPFS")
  .action(async () => {
    await publishDid();
  });

program
  .command("resolve")
  .description("Resolve DID Document from IPFS")
  .action(async () => {
    await resolveDid();
  });

program
  .command("verify")
  .description("Verify SWTC NFT Verifiable Credential")
  .action(async () => {
    await verifyVC();
  });

program.parse(process.argv);
