"use strict";

const net = require("node:net");
const socket = net.connect({host: "203.0.113.1", port: 9});
socket.setTimeout(750);
socket.on("connect", () => process.exit(3));
socket.on("error", () => process.exit(77));
socket.on("timeout", () => { socket.destroy(); process.exit(77); });
