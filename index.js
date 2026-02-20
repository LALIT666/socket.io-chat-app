import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
});

const db = await open({
  filename: "chat.db",
  driver: sqlite3.Database,
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_offset TEXT UNIQUE,
  content TEXT
  );
  `);
const __dirname = dirname(fileURLToPath(import.meta.url));

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

io.on("connection", async (socket) => {
  console.log("user connected");
  console.log("recovered?", socket.recovered);
  if (!socket.recovered) {
    try {
      await db.each(
        "SELECT id, content FROM messages WHERE id > ?",
        [socket.handshake.auth.serverOffset || 0],
        (_err, row) => {
          socket.emit("chat message", row.content, row.id);
        },
      );
    } catch (error) {
      console.error("Failed to send missed messages: ", error);
    }
  }

  socket.on("chat message", async (msg) => {
    let result;
    try {
      result = await db.run("INSERT INTO messages (content) VALUES (?)", msg);
    } catch (error) {
      console.error("Failed to save message: ", error);
      return;
    }
    io.emit("chat message", msg, result.lastID);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

server.listen(3000, () => {
  console.log(`server running at http://localhost:3000`);
});
