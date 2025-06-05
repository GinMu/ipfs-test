import { car } from "@helia/car";
import path from "path";
import fs from "fs";

export default class Dag {
  constructor(helia) {
    this.helia = helia;
    this.car = car(helia);
  }

  async exportDag(cid) {
    const dist = path.join("car", `${cid.toString()}.car`);
    const stream = fs.createWriteStream(dist);
    const start = Date.now();
    for await (const buf of this.car.stream(cid)) {
      console.log(`buffer size: ${buf.length} bytes`);
      stream.write(buf);
    }
    const end = Date.now();

    stream.end();
    const duration = (end - start) / 1000;

    console.log(`DAG exported to ${dist}`, `, time: ${duration.toFixed(2)} seconds`);
  }
}
