import { createHelia } from "helia";
import { unixfs } from "@helia/unixfs";
import { ipns } from "@helia/ipns";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { generateKeyPair, privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { getIPNSNameFromKeypair } from "./utils.js";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { create as createKuboClient } from "kubo-rpc-client";
import { createHeliaHTTP } from "@helia/http";

const kubo = createKuboClient({
  url: "http://127.0.0.1:5001"
});
async function uploadToIPNSDirectory() {
  console.log("开始上传文件到 IPNS 目录");
  console.log("日期时间: 2025-06-05 07:13:51 UTC");
  console.log("用户: GinMu@helia");

  // 初始化 Helia
  console.log("初始化 Helia...");
  const helia = await createHeliaHTTP();
  const fs = unixfs(helia);
  const ipnsImpl = ipns(helia);

  try {
    // 生成新的 IPNS 密钥或使用现有密钥

    const PRIVATE_KEY = "CAESQDIO27/xDRuh+h0VGa2FOTSxCSpBIceSu864J68DwNXYBQLmVYqwLTMPOBv0A6/oMu0nOoZwjYz1KbTUPPGJ048";
    const keypair = privateKeyFromProtobuf(uint8ArrayFromString(PRIVATE_KEY, "base64"));

    const ipnsName = getIPNSNameFromKeypair(keypair);
    console.log(`IPNS name: ${ipnsName}`);

    const { cid } = await kubo.add(
      {
        path: "ccdao/example.txt",
        content: uint8ArrayFromString("Hello from Helia! 上传时间: 2025-06-05 18:13:51 UTC")
      },
      {
        wrapWithDirectory: true
      }
    );
    console.log(`文件已添加，CID: }`, cid);

    // // 从当前目录开始

    // // 将文件添加到目录
    // let dirCid = await fs.cp(cid, currentDirectoryCid, filename)

    // console.log(`文件已添加到目录，新目录 CID: ${dirCid}`)

    // console.log('IPNS 记录已成功更新!')
    // console.log(`可通过以下方式访问内容:`)
    // console.log(`- ipns://${ipnsName}/${filename}`)
    // console.log(`- https://gateway.ipfs.io/ipns/${ipnsName}/${filename}`)

    // // 列出更新后的目录内容
    // console.log('\n更新后的目录内容:')
    // for await (const entry of fs.ls(dirCid)) {
    //     console.log(`- ${entry.name} (${entry.cid.toString()})`)
    // }

    // // 将 IPNS 记录更新为指向新目录
    // console.log('正在发布 IPNS 记录...')
    await ipnsImpl.publish(keypair, cid);

    // return {
    //     ipnsName,
    //     directoryCid: dirCid.toString(),
    //     filename
    // }
  } catch (err) {
    console.error("上传过程中出错:", err);
    throw err;
  } finally {
    // 关闭 Helia 节点
    console.log("关闭 Helia...");
    await helia.stop();
  }
}

// 如果直接运行此脚本
uploadToIPNSDirectory()
  .then((result) => {
    console.log("\n上传成功完成!");
  })
  .catch((err) => {
    console.error("上传失败:", err);
    process.exit(1);
  });
