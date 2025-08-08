#!/usr/bin/env bash
docker run -d --name ipfs_kubo_node -p 4001:4001 -p 4001:4001/udp -p 8080:8080 -p 127.0.0.1:5001:5001 ipfs/kubo:latest