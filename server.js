const express = require("express");
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

app.use(express.static("public"));
app.use(express.json());

let sock;
let messageLines = [];

async function startWhatsApp(socket) {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, pairCode } = update;
    if (qr) {
      // Emit QR code for display
      socket.emit("qr", qr);
    }
    if (pairCode) {
      // Emit pair code for pairing
      socket.emit("pairCode", pairCode);
    }
    if (connection === "open") {
      socket.emit("connected", true);
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("start-login", (number) => {
    startWhatsApp(socket);
  });

  socket.on("start-sending", async ({ number, hatersName, delay }) => {
    const jid = number.includes("@s.whatsapp.net") ? number : number + "@s.whatsapp.net";
    for (let i = 0; i < messageLines.length; i++) {
      const msg = `${hatersName} ${messageLines[i]}`;
      await sock.sendMessage(jid, { text: msg });
      socket.emit("message-status", { index: i + 1, text: msg });
      await new Promise((r) => setTimeout(r, delay * 1000));
    }
    socket.emit("done");
  });

  socket.on("upload-message-file", (data) => {
    const filePath = path.join(__dirname, "messages.txt");
    fs.writeFileSync(filePath, data);
    messageLines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    socket.emit("file-uploaded", messageLines.length);
  });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
