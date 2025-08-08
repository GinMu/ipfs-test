#!/usr/bin/env node
import { createHeliaHTTP } from "@helia/http";
import { ipns as IPNS } from "@helia/ipns";
import {
  generateKeyPair,
  privateKeyFromProtobuf,
  publicKeyFromRaw,
  privateKeyFromRaw,
  privateKeyToProtobuf
} from "@libp2p/crypto/keys";
import { CID } from "multiformats/cid";
import { importer } from "ipfs-unixfs-importer";
import { MemoryBlockstore } from "blockstore-core/memory";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { Command } from "commander";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { concat as uin8ArrayConcat } from "uint8arrays/concat";
import { getIPNSNameFromKeypair } from "./utils.js";
import { create as createKuboClient } from "kubo-rpc-client";
import fs from "fs";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

import Dag from "./dag.js";
import CarStream from "./car-stream.js";
import Web3Storage from "./web3-storage.js";
import path from "path";
import { ZipFile } from "yazl";
import { Parser } from "@json2csv/plainjs";
import { string as stringFormatter } from "@json2csv/formatters";
import validate from "./validate-car.js";
import unzip from "./unzip.js";
import { decrypt, encrypt } from "./ecies.js";
import { PrivateKey } from "eciesjs";

const PRIVATE_KEY = "CAESQKt9yzxEa4vNMnqqj6ABo6ierevBv9S0RdYzeQArEr8hekAAWPlAhk4lepVC43Aj+6Dh4lUThxitF9O4Tzo8FB0";
const keypair = privateKeyFromProtobuf(uint8ArrayFromString(PRIVATE_KEY, "base64"));
const helia = await createHeliaHTTP();
const ipns = IPNS(helia);
const kubo = createKuboClient({
  url: "http://127.0.0.1:5001"
});

const CID1 = CID.parse("bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom");
const CID2 = CID.parse("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");

const getPinCids = async (cid) => {
  const pinCids = [];
  for await (const pin of kubo.pin.ls({
    paths: [cid]
  })) {
    pinCids.push(pin.cid);
  }
  return pinCids;
};

const program = new Command();

program.name("test-ipfs").description("test ipfs").version("1.0.0", "-v, --version", "Output the current version");

program
  .command("ipns-publish")
  .description("publish cid to IPNS")
  .action(async () => {
    let record;
    try {
      const result = await ipns.resolve(keypair.publicKey);
      record = result.record;
    } catch (error) {
      console.error("Resolving IPNS error:", error);
    }
    const value = record?.value;
    console.info("IPNS Record Value:", value);
    const cid = value?.includes(CID1.toString()) ? CID2 : CID1;
    console.info("Publishing CID:", cid);
    const ipnsName = getIPNSNameFromKeypair(keypair);
    console.info("IPNS Name:", ipnsName);
    const file = await ipns.publish(keypair, cid, {
      lifetime: 24 * 60 * 60 * 1000,
      offline: false,
      ttl: 60 * 1000
    });
    console.info("Published file:", file);
    const result = await ipns.resolve(keypair.publicKey);
    console.info("Resolve result:", result);
    console.log(`可以通过 https://ipfs.io/ipns/${ipnsName} 访问`);
  });

program
  .command("ipns-resolve")
  .description("resolve IPNS record")
  .action(async () => {
    const result = await ipns.resolve(keypair.publicKey);
    console.info("Resolve result:", result);
  });

program
  .command("generate-keypair")
  .description("generate a new keypair")
  .action(async () => {
    const keypair = await generateKeyPair("Ed25519");
    console.log("Generated Keypair:", keypair);
    const base64 = uint8ArrayToString(privateKeyToProtobuf(keypair), "base64");
    console.log("Base64 Encoded Keypair:", base64);
  });

program
  .command("export-dag")
  .description("export a DAG to a CAR file")
  .argument("<cid>", "CID of the DAG to export")
  .action(async (cid) => {
    const dag = new Dag(helia);
    await dag.exportDag(CID.parse(cid));
  });

program
  .command("import-car")
  .description("import a CAR file to peer")
  .argument("<car>", "Path to the CAR file")
  .action(async (car) => {
    if (!fs.existsSync(car)) {
      console.error(`File not found: ${car}`);
      return;
    }
    const carStream = new CarStream(kubo);
    const result = await carStream.importCar(car);
    console.info("Import result:", result);
  });

program
  .command("fetch-upload-list")
  .description("Fetch the list of uploaded files from Web3Storage")
  .arguments("<email>", "Email for Web3Storage login")
  .action(async (email) => {
    const web3Storage = new Web3Storage();
    await web3Storage.login(email);
    const uploads = await web3Storage.fetchAllUploadList();
    console.info("Fetched Uploads:", uploads);
  });

program
  .command("sync-web3-storage")
  .description("Sync web3.storage uploads to local peer")
  .arguments("<email>", "Email for Web3Storage login")
  .action(async (email) => {
    const web3Storage = new Web3Storage();
    await web3Storage.login(email);

    const uploads = await web3Storage.fetchAllUploadList();
    const cids = uploads.map((upload) => upload.root);
    console.info("Fetched Uploads CIDs:", cids);

    const dag = new Dag(helia);
    const carStream = new CarStream(kubo);

    for (const cid of cids) {
      try {
        await getPinCids(cid);
        console.info(`CID ${cid} is already pinned.`);
      } catch (_) {
        console.info(`CID ${cid} is not pinned, pinning now...`);
        const car = path.join("car", `${cid.toString()}.car`);
        if (!fs.existsSync(car)) {
          await dag.exportDag(cid);
          console.info(`Exported DAG to CAR file: ${car}`);
        }
        const result = await carStream.importCar(car);
        console.info(`Imported CAR file: `, result);
      }
    }
  });

program
  .command("update-ipns-record")
  .description("Update IPNS record with a new CID")
  .action(async () => {
    const content = `Hello from Helia! Upload time: ${new Date().toISOString()}`;
    console.info("Adding content: ", content);
    const PRIVATE_KEY = "CAESQDIO27/xDRuh+h0VGa2FOTSxCSpBIceSu864J68DwNXYBQLmVYqwLTMPOBv0A6/oMu0nOoZwjYz1KbTUPPGJ048";
    const keypair = privateKeyFromProtobuf(uint8ArrayFromString(PRIVATE_KEY, "base64"));
    const ipnsName = getIPNSNameFromKeypair(keypair);
    const path = "ccdao/hello.txt";
    const { cid } = await kubo.add(
      {
        path,
        content: uint8ArrayFromString(content)
      },
      {
        // Wrap the content in a directory
        wrapWithDirectory: true
      }
    );
    await ipns.publish(keypair, cid);
    console.log(`visit https://ipfs.io/ipns/${ipnsName}/${path}`);
  });

program
  .command("unmarshal-secp256k1")
  .description("Unmarshal a secp256k1 private key")
  .action(() => {
    const keypair = {
      privateKey: "7a6ff008ee2d556eadf39e7e6a32bf7eee3c6251b30831fe5417e2b06aad3a18",
      publicKey: "027d8aa2c023b41ae1b86ea806c5bf84db48801e884778e44741c229d0e5ad6a37"
    };
    const privateKey = privateKeyFromRaw(uint8ArrayFromString(keypair.privateKey, "hex"));
    console.info("Unmarshalled Private Key (Secp256k1):", privateKey);
    const publicKey = publicKeyFromRaw(uint8ArrayFromString(keypair.publicKey, "hex"));
    console.info("Public Key from Raw (Secp256k1):", publicKey);

    const pub = uint8ArrayToString(publicKey.raw, "hex");
    console.info("Public Key from Raw (Secp256k1):", pub);
  });

program
  .command("unmarshal-ed25519")
  .description("Unmarshal an Ed25519 private key")
  .action(async () => {
    const keypair = {
      privateKey: "628021cb2cecb88782bb1a5a5efe5c6c225b6f952394d09d34917ef50ee63f06",
      publicKey: "3c1a2f25abc2dd9124b56a329284cc5242a775fcab0e048269d6a2b9d103cc32"
    };
    const priv = privateKeyFromRaw(uint8ArrayFromString(keypair.privateKey + keypair.publicKey, "hex"));
    console.info("Unmarshalled Private Key (Ed25519):", priv);
    const publicKey = publicKeyFromRaw(uint8ArrayFromString(keypair.publicKey, "hex"));
    console.info("Public Key from Raw (Ed25519):", publicKey);

    const pub = uint8ArrayToString(publicKey.raw, "hex");
    console.info("Public Key from Raw (Ed25519):", pub);
  });

program
  .command("validate-car")
  .description("Validate a CAR file")
  .argument("<carPath>", "Path to the CAR file")
  .action(async (carPath) => {
    try {
      await validate(carPath);
      console.info("CAR file is valid.");
    } catch (error) {
      console.error("CAR file validation failed: ", error);
    }
  });

program
  .command("generate-cid")
  .description("Generate a CID from a file")
  .argument("<path>", "Path to the file")
  .argument("[wrapWithDirectory]", "Wrap the content in a directory", false)
  .action(async (path, wrapWithDirectory) => {
    const blockstore = new MemoryBlockstore();
    const source = [
      {
        path,
        content: fs.createReadStream(path)
      }
    ];
    const cids = [];
    for await (const entry of importer(source, blockstore, {
      wrapWithDirectory,
      cidVersion: 1
    })) {
      cids.push(entry);
    }
    console.info("Generated CIDs:", cids);
  });

program
  .command("unzip")
  .description("Unzip and rename NFT images in a directory")
  .argument("<zipFilePath>", "Path to the zip file")
  .argument("<output>", "Output directory for unzipped images")
  .action(async (zipFilePath, output) => {
    console.log("Unzipping NFT images from:", zipFilePath);
    await unzip(zipFilePath, output);
    const files = fs.readdirSync(output);
    console.log("Unzipped success, files length:", files.length);
  });

program
  .command("zip")
  .description("Zip a directory of NFT images")
  .argument("<inputDir>", "Directory containing NFT images")
  .argument("<outputZip>", "Output zip file path")
  .action(async (inputDir, outputZip) => {
    const zipfile = new ZipFile();
    const files = fs.readdirSync(inputDir);

    for (const file of files) {
      const filePath = path.join(inputDir, file);
      if (fs.statSync(filePath).isFile()) {
        zipfile.addFile(filePath, filePath);
      }
    }

    zipfile.outputStream.pipe(fs.createWriteStream(outputZip)).on("close", () => {
      console.log(`Zipped ${files.length} files to ${outputZip}`);
    });
    zipfile.end();
  });

program
  .command("ls")
  .description("List files in a cid")
  .argument("<cid>", "CID of the directory to list")
  .action(async (cid) => {
    const files = [];
    for await (const file of kubo.ls(cid)) {
      files.push(file);
    }
    const cids = files
      .map(({ name, cid }) => {
        return {
          tokenID: Number(name.split(".")[0]),
          cid: cid.toString()
        };
      })
      .sort((a, b) => a.tokenID - b.tokenID);
    fs.writeFileSync(`./car/${cid}.json`, JSON.stringify(cids, null, 2));
  });

program
  .command("routing-provide")
  .description("Provide a CID to the routing system")
  .argument("recursive", "Provide child CIDs recursively")
  .argument("<cid...>", "CID to provide")
  .action(async (recursive, cids) => {
    try {
      for await (const route of kubo.routing.provide(cids, {
        recursive
      })) {
        console.info("Provided route:", route);
      }
      console.info("Provided CID:", cids);
    } catch (error) {
      console.error(`Failed to provide CID: ${cid}`, error);
    }
  });

program
  .command("routing-find-providers")
  .description("Find providers for a CID")
  .argument("<cid>", "CID to find providers for")
  .action(async (cid) => {
    const cidObj = CID.parse(cid);
    try {
      const routes = [];
      for await (const provider of kubo.routing.findProvs(cidObj)) {
        routes.push(provider);
      }
      const providers = routes
        .filter((route) => route.name === "PROVIDER")
        .map(({ providers }) => providers?.[0]?.id)
        .filter(Boolean);
      console.log("Found providers:", JSON.stringify(providers, null, 2));
    } catch (error) {
      console.error(`Failed to find providers for CID: ${cid}`, error);
    }
  });

program
  .command("generate-nft-storage-csv")
  .description("Generate a CSV file from a JSON file containing NFT storage data")
  .argument("<jsonFile>", "Path to the input JSON file")
  .argument("<csvFile>", "Path to the output CSV file")
  .argument("[indexFrom]", "Index from which to start processing the JSON data")
  .argument("[indexEnd]", "Index at which to stop processing the JSON data")
  .action(async (jsonFile, csvFile, from, to) => {
    if (!fs.existsSync(jsonFile)) {
      console.error(`JSON file not found: ${jsonFile}`);
      return;
    }
    const parser = new Parser({
      formatters: {
        string: stringFormatter({ quote: "" })
      }
    });
    let jsonData = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));
    if (from !== undefined && to !== undefined) {
      const startIndex = parseInt(from, 10);
      const endIndex = parseInt(to, 10);
      if (isNaN(startIndex) || isNaN(endIndex)) {
        console.error("Invalid index range provided.");
        return;
      }
      jsonData = jsonData.filter(({ tokenID }) => tokenID >= startIndex && tokenID <= endIndex);
    }
    const csv = parser.parse(jsonData);
    fs.writeFileSync(csvFile, csv);
    console.log(`CSV file created at: ${csvFile}`);
  });

program
  .command("sha256")
  .description("Calculate SHA256 hash of a message")
  .argument("<message>", "Message to hash")
  .action((message) => {
    const hash = sha256.create().update(message).digest();
    const hashHex = bytesToHex(hash);
    console.log(`SHA256 hash of "${message}":`, hashHex);
  });

program
  .command("ecies")
  .description("ECIES encryption and decryption")
  .argument("<message>", "Message to encrypt")
  .argument("[curve]", "Elliptic curve to use (default: ed25519)", "ed25519")
  .action(async (message, curve) => {
    const sk = new PrivateKey(undefined, curve);
    const encrypted = await encrypt({
      publicKey: sk.publicKey.toBytes(),
      data: Buffer.from(message),
      curve
    });
    console.log("Encrypted Data:", uint8ArrayToString(encrypted, "hex"));
    const decrypted = await decrypt({
      privateKey: sk.secret,
      data: encrypted,
      curve
    });
    console.log("Decrypted Data:", uint8ArrayToString(decrypted));
  });

const makeMFSCommand = () => {
  const mfs = new Command("mfs");
  // MFS目录
  const mfsDir = path.join("/", "test");

  mfs
    .description("Manage MFS (Mutable File System) operations")
    .version("0.0.1", "-v, --version", "Output the current version");

  mfs
    .command("write")
    .description("Write a file to MFS")
    .action(async () => {
      const localFile = Math.random() + ".txt";
      const mfsFile = path.join(mfsDir, localFile);
      await kubo.files.write(
        mfsFile,
        Buffer.from(
          JSON.stringify(
            {
              name: localFile,
              description: "test file",
              date: new Date().toISOString()
            },
            null,
            2
          )
        ),
        {
          create: true,
          parents: true,
          // truncate: true 覆盖原文件
          // truncate: false, 不覆盖原文件
          // 例如: 原文件内容为test, 写入的内容为m, 则MFS中的文件内容为mest
          truncate: true,
          cidVersion: 1
          // HAMT(Hash Array Mapped Trie)
          // 如果目录下的文件数量超过 shardSplitThreshold，则会将目录拆分成多个子目录
          // 这有助于提高性能，特别是在处理大量小文件时, 递归 pin、内容同步等操作效率更高

          // kubo 0.36.0 好像移除了
          // shardSplitThreshold: 1000
        }
      );

      console.log(`已将 ${localFile} 添加到 Kubo 的 MFS 目录 ${mfsDir}`);
      const stat = await kubo.files.stat(mfsDir);
      console.log("当前目录 CID:", stat.cid.toString());

      // await kubo.routing.provide(stat.cid, {
      //   recursive: true
      // });
    });

  mfs
    .command("read")
    .description("Read a file from MFS")
    .action(async () => {
      const chunks = [];
      for await (const value of await kubo.files.read(path.join(mfsDir, "0.20183438980027257.txt"))) {
        chunks.push(value);
      }
      const v = uint8ArrayToString(uin8ArrayConcat(chunks));
      console.log(`读取到的内容: ${v}`);
    });

  mfs
    .command("stat")
    .description("Stat cid")
    .action(async () => {
      const stat = await kubo.files.stat(mfsDir);
      console.log("Stat Result:", stat);
    });

  return mfs;
};

program.addCommand(makeMFSCommand());

program.parse(process.argv);
