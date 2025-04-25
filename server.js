const express = require("express");
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
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

async function startWhatsApp(sockId, socket, number) {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  sock = makeWASocket({ version, auth: state, printQRInTerminal: false, syncFullHistory: false });

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, pairCode } = update;
    
    if (qr) {
      socket.emit("qr", qr); // Send the QR code to the frontend
    }
    
    if (pairCode) {
      socket.emit("pairCode", pairCode); // Send the pair code to the frontend
    }

    if (connection === "open") {
      socket.emit("connected", true); // Notify frontend that the connection is open
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("start-login", ({ number }) => {
    startWhatsApp(socket.id, socket, number); // Start login for the provided number
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

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
