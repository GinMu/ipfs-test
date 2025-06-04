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

    for await (const buf of this.car.stream(cid)) {
      console.log(`buffer size: ${buf.length} bytes`);
      stream.write(buf);
    }

    stream.end();
    console.log(`DAG exported to ${dist}`);
  }
}
