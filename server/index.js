/* =====================================================
   ERS COMPLETE SERVER - FINAL STABLE BUILD (FIXED)
===================================================== */

require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));

app.use(express.json());

/* ================= ROOT ================= */

app.get("/", (req, res) => {
  res.send("🚑 ERS Backend Server Running");
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

/* ================= DATABASE ================= */

const db = mysql.createPool({
  host: mysql.railway.internal,
  port: 21222,
  user: root,
  password: WTkZqdgEBFAHKdEZVOPIBSvNMOqzbZao,
  database: ers,
  waitForConnections: true,
  connectionLimit: 10,
});

db.getConnection()
  .then(conn => {
    console.log("📂 Database Connected");
    conn.release();
  })
  .catch(err => {
    console.error("❌ Database Connection Failed:", err.message);
  });

/* ================= SERVER ================= */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/* ================= SOCKET ================= */

io.on("connection", socket => {

  console.log("✅ Connected:", socket.id);

  socket.on("joinUser", id => id && socket.join("user_" + id));
  socket.on("joinResponder", id => id && socket.join("responder_" + id));
  socket.on("joinControl", service =>
    service && socket.join("control_" + service.toLowerCase())
  );

  /* ===== Responder Location ===== */
  socket.on("responderLocation", async ({ responderId, lat, lng }) => {
    if (!responderId) return;

    try {
      await db.query(
        "UPDATE responders SET latitude=?,longitude=? WHERE id=?",
        [lat, lng, responderId]
      );

      const [[a]] = await db.query(`
        SELECT r.user_id,r.service_type
        FROM assignments a
        JOIN reports r ON r.id=a.report_id
        WHERE a.responder_id=?
        AND a.status='accepted'
        ORDER BY a.created_at DESC
        LIMIT 1
      `,[responderId]);

      if (!a) return;

      const payload = { responderId, lat, lng };

      io.to("user_" + a.user_id).emit("liveResponderLocation", payload);
      io.to("control_" + a.service_type.toLowerCase())
        .emit("liveResponderLocation", payload);

    } catch (err) {
      console.error("Responder location update error:", err);
    }
  });

  /* ===== User Location ===== */
  socket.on("userLocation", async ({ userId, lat, lng }) => {
    if (!userId) return;

    try {
      const [[a]] = await db.query(`
        SELECT a.responder_id, r.service_type
        FROM assignments a
        JOIN reports r ON r.id = a.report_id
        WHERE r.user_id = ?
        AND a.status = 'accepted'
        ORDER BY a.created_at DESC
        LIMIT 1
      `, [userId]);

      if (a) {
        io.to("responder_" + a.responder_id)
          .emit("liveUserLocation", { lat, lng });

        io.to("control_" + a.service_type.toLowerCase())
          .emit("liveUserLocation", { userId, lat, lng });
      }

    } catch (err) {
      console.error("User location update error:", err);
    }
  });

});

/* ================= CONTROL APIs ================= */

app.get("/reports/:service", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM reports
      WHERE service_type=?
      AND status IN ('pending','assigned','accepted')
      ORDER BY created_at DESC
    `, [req.params.service.toLowerCase()]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/responders/:service", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM responders
      WHERE service_type=?
    `, [req.params.service.toLowerCase()]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= LOGIN ================= */

app.post("/login", async (req, res) => {
  try {
    const { name, phone } = req.body;

    const [u] = await db.query(
      "SELECT * FROM users WHERE phone=?",
      [phone]
    );

    if (u.length) return res.json(u[0]);

    const [r] = await db.query(
      "INSERT INTO users(name,phone) VALUES(?,?)",
      [name, phone]
    );

    res.json({ id: r.insertId, name, phone });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= REQUEST ================= */

app.post("/request", async (req, res) => {
  try {
    const { user_id, service_type, location } = req.body;

    const loc = `${location.lat},${location.lng}`;

    const [r] = await db.query(`
      INSERT INTO reports
      (user_id,service_type,status,location,created_at)
      VALUES(?,?, 'pending', ?,NOW())
    `,[user_id, service_type.toLowerCase(), loc]);

    const report = {
      id: r.insertId,
      user_id,
      service_type,
      location: loc
    };

    io.to("control_" + service_type.toLowerCase())
      .emit("newReport", report);

    res.json(report);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= ASSIGN ================= */

app.post("/assign", async (req, res) => {
  const conn = await db.getConnection();

  try {
    const { reportId, responderId } = req.body;

    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      "SELECT status FROM reports WHERE id=?",
      [reportId]
    );

    if (existing && existing.status === 'accepted')
      throw new Error("Already accepted");

    await conn.query(
      "DELETE FROM assignments WHERE report_id=? AND status IN ('pending','rejected')",
      [reportId]
    );

    await conn.query(`
      INSERT INTO assignments
      (report_id,responder_id,status,created_at)
      VALUES(?,?,'pending',NOW())
    `,[reportId,responderId]);

    await conn.query(
      "UPDATE reports SET status='assigned' WHERE id=?",
      [reportId]
    );

    io.to("responder_" + responderId)
      .emit("newAssignment",{reportId});

    await conn.commit();

    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

/* ================= ASSIGNMENT STATUS ================= */

app.post("/assignment-status", async (req, res) => {
  const conn = await db.getConnection();

  try {
    const { reportId, responderId, status } = req.body;

    await conn.beginTransaction();

    await conn.query(
      `UPDATE assignments SET status=? 
       WHERE report_id=? AND responder_id=?`,
      [status.toLowerCase(), reportId, responderId]
    );

    if (status.toLowerCase() === "accepted") {

      await conn.query(
        "UPDATE responders SET status='busy' WHERE id=?",
        [responderId]
      );

      await conn.query(
        "UPDATE reports SET status='accepted' WHERE id=?",
        [reportId]
      );

      const [[report]] = await conn.query(
        "SELECT user_id, service_type FROM reports WHERE id=?",
        [reportId]
      );

      const [[responder]] = await conn.query(
        "SELECT * FROM responders WHERE id=?",
        [responderId]
      );

      if (report && responder) {
        io.to("user_" + report.user_id)
          .emit("emergencyAccepted",{ responder });

        io.to("control_" + report.service_type.toLowerCase())
          .emit("assignmentUpdate");
      }

    } else if (status.toLowerCase() === "rejected") {

      await conn.query(
        "UPDATE reports SET status='pending' WHERE id=?",
        [reportId]
      );

      const [[report]] = await conn.query(
        "SELECT service_type FROM reports WHERE id=?",
        [reportId]
      );

      if (report) {
        io.to("control_" + report.service_type.toLowerCase())
          .emit("assignmentUpdate");
      }
    }

    await conn.commit();
    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

/* ================= COMPLETE ================= */

app.post("/complete", async (req, res) => {
  try {
    const { reportId, responderId } = req.body;

    await db.query(
      "UPDATE assignments SET status='completed' WHERE report_id=?",
      [reportId]
    );

    await db.query(
      "UPDATE reports SET status='completed' WHERE id=?",
      [reportId]
    );

    await db.query(
      "UPDATE responders SET status='available' WHERE id=?",
      [responderId]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= START ================= */

const PORT = process.env.PORT || 5000;

server.listen(PORT, () =>
  console.log(`🚑 ERS SERVER RUNNING ON PORT ${PORT}`)
);