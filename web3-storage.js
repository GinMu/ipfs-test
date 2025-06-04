import { create } from "@web3-storage/w3up-client";

export default class Web3Storage {
  constructor() {
    this.client = null;
  }

  async login(email) {
    const client = await create();
    const account = await client.login(email);
    console.log("Logged in as:", account);
    this.client = client;
    return account;
  }

  async fetchUploadList(cursor = "") {
    if (!this.client) {
      throw new Error("Client not initialized. Please login first.");
    }
    const list = await this.client.capability.upload.list({
      cursor,
      size: 50,
      pre: false
    });
    return list;
  }

  async fetchAllUploadList() {
    if (!this.client) {
      throw new Error("Client not initialized. Please login first.");
    }
    let allUploads = [];
    let cur = "";
    do {
      const { results, cursor } = await this.fetchUploadList(cur);
      allUploads = allUploads.concat(results);
      cur = cursor;
    } while (cur);
    return allUploads;
  }
}
