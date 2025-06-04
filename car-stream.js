import { pipeline } from "stream/promises";
import { Transform } from "stream";
import fs from "fs";

export default class CarStream {
  constructor(kuboRpcClient) {
    this.client = kuboRpcClient;
  }

  async importCar(carFilePath) {
    const fileSize = fs.statSync(carFilePath).size;
    console.log(`${carFilePath} size:  ${fileSize} bytes`);
    const fileStream = fs.createReadStream(carFilePath);
    let bytesProcessed = 0;
    let lastLogTime = Date.now();

    const progressTracker = new Transform({
      transform(chunk, _, callback) {
        bytesProcessed += chunk.length;
        const now = Date.now();
        if (now - lastLogTime > 1000) {
          const progress = ((bytesProcessed / fileSize) * 100).toFixed(2);
          console.log(`progress: ${progress}%`);
          lastLogTime = now;
        }
        callback(null, chunk);
      }
    });

    console.log("start import...");
    const startTime = Date.now();

    const result = await pipeline(
      fileStream,
      progressTracker,
      async function* (source) {
        for await (const chunk of source) {
          yield chunk;
        }
      },
      async (source) => {
        const task = await this.client.dag.import(source, { pin: true });
        const result = await task.next();
        return result.value;
      }
    );

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`finished time: ${duration.toFixed(2)} seconds`);
    return result;
  }
}
