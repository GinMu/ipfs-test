import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import pDefer from "p-defer";

const isIgnoredFile = (fileName) => {
  return fileName.startsWith(".") || fileName.startsWith("__MACOSX/") || !fileName.endsWith(".png");
};

const unzip = async (zipFilePath, output) => {
  const defer = pDefer();
  if (!fs.existsSync(output)) {
    fs.mkdirSync(output, { recursive: true });
  }
  yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
    if (err) throw err;
    zipfile.readEntry();
    zipfile.on("entry", (entry) => {
      const { fileName } = entry;
      if (isIgnoredFile(fileName)) {
        zipfile.readEntry();
        return;
      }

      if (/\/$/.test(fileName)) {
        zipfile.readEntry();
      } else {
        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) throw err;
          const basename = path.basename(entry.fileName);
          if (isIgnoredFile(basename)) {
            zipfile.readEntry();
            return;
          }
          const extname = path.extname(basename);
          const [id] = basename.match(/\d+/g);
          const newId = Number(id) - 1;
          const newFileName = `${newId}${extname}`;
          console.log(`Unzipping: ${entry.fileName} -> ${newFileName}`);
          readStream.pipe(fs.createWriteStream(path.join(output, newFileName)));
          readStream.on("end", () => zipfile.readEntry());
        });
      }
    });
    zipfile.on("end", () => {
      defer.resolve();
    });
    zipfile.on("error", (err) => {
      defer.reject(err);
    });
  });
  return defer.promise;
};

export default unzip;
