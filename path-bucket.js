import crypto from "crypto";

// export type BucketOptions = {
//   levels?: number;       // 层级数，默认 2
//   segmentLen?: number;   // 每层前缀长度，默认 2
//   useCidPrefix?: boolean;// true: 直接用 CID 前缀；false: 用 sha256(id)
//   stripMultibase?: boolean; // 对 CID 是否去掉首字符（如 'b'），默认 true
//   root?: string;         // MFS 根路径前缀，默认 '/mfs/data'
// };

/**
 * 由 CID 生成分桶段数组
 */
export const cidSegments = (cid, levels, segmentLen, stripMultibase) => {
  const s = stripMultibase ? cid.slice(1) : cid; // base32 CID 多以 'b' 开头
  const need = levels * segmentLen;
  if (s.length < need) {
    // 不足时右侧补位，保证固定宽度
    const pad = s.padEnd(need, "0");
    return new Array(levels).fill(0).map((_, i) => pad.slice(i * segmentLen, (i + 1) * segmentLen));
  }
  return new Array(levels).fill(0).map((_, i) => s.slice(i * segmentLen, (i + 1) * segmentLen));
};

/**
 * 由任意 id 生成 sha256 hex 前缀分桶段数组
 */
export const hashSegments = (id, levels, segmentLen) => {
  const hex = crypto.createHash("sha256").update(id).digest("hex"); // 64 hex chars
  return new Array(levels).fill(0).map((_, i) => hex.slice(i * segmentLen, (i + 1) * segmentLen));
};

/**
 * 生成多级分桶路径（不含最终文件名）
 * 例如：/mfs/data/ab/cd/ef
 */
export const makeBucketPath = (key, opts) => {
  const { levels = 2, segmentLen = 2, useCidPrefix = true, stripMultibase = true, root = "/mfs/data" } = opts;

  const segs = useCidPrefix
    ? cidSegments(key, levels, segmentLen, stripMultibase)
    : hashSegments(key, levels, segmentLen);

  return [root, ...segs].join("/");
};

/**
 * 生成完整 MFS 路径（包含文件名部分）。
 * filename 可用 CID、自定义 ID，或附带扩展名。
 */
export const makeMfsFilePath = (key, filename, opts) => {
  const base = makeBucketPath(key, opts);
  const name = filename ?? key;
  return `${base}/${name}`;
};
