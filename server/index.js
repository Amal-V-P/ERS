/* =====================================================
   ERS COMPLETE SERVER - FINAL STABLE BUILD
===================================================== */

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());

/* ================= DATABASE ================= */

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "00000000",
  database: "ers",
  waitForConnections: true,
  connectionLimit: 10,
});

// Test connection
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
  cors: { origin: "http://localhost:5173" }
});

/* =====================================================
   SOCKET SYSTEM
===================================================== */

io.on("connection", socket => {

  console.log("✅ Connected:", socket.id);

  socket.on("joinUser", id =>
    id && socket.join("user_" + id)
  );

  socket.on("joinResponder", id =>
    id && socket.join("responder_" + id)
  );

  socket.on("joinControl", service =>
    service &&
    socket.join("control_" + service.toLowerCase())
  );

  socket.on("responderLocation",
    async ({ responderId, lat, lng }) => {

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

        const payload={responderId,lat,lng};

        io.to("user_"+a.user_id)
          .emit("liveResponderLocation",payload);

        io.to("control_"+a.service_type)
          .emit("liveResponderLocation",payload);
      } catch (err) {
        console.error("Responder location update error:", err);
      }
  });

  socket.on("userLocation", async ({ userId, lat, lng }) => {
    if (!userId) return;
    try {
      const [[a]] = await db.query(`
        SELECT a.responder_id
        FROM assignments a
        JOIN reports r ON r.id = a.report_id
        WHERE r.user_id = ?
        AND a.status = 'accepted'
        ORDER BY a.created_at DESC
        LIMIT 1
      `, [userId]);

      if (a) {
        io.to("responder_" + a.responder_id).emit("liveUserLocation", { lat, lng });
        
        // Also send to control room
        const [[r]] = await db.query("SELECT service_type FROM reports WHERE user_id=? AND status='accepted' LIMIT 1", [userId]);
        if(r) {
          io.to("control_" + r.service_type.toLowerCase()).emit("liveUserLocation", { userId, lat, lng });
        }
      }
    } catch (err) {
      console.error("User location update error:", err);
    }
  });
});

/* =====================================================
   CONTROL DASHBOARD APIs ✅ ADDED
===================================================== */

app.get("/reports/:service", async (req,res)=>{
  const [rows]=await db.query(`
    SELECT * FROM reports
    WHERE service_type=?
    AND status IN ('pending','assigned','accepted')
    ORDER BY created_at DESC
  `,[req.params.service.toLowerCase()]);
  res.json(rows);
});

app.get("/responders/:service", async (req,res)=>{
  const [rows]=await db.query(`
    SELECT * FROM responders
    WHERE service_type=?
  `,[req.params.service.toLowerCase()]);
  res.json(rows);
});

/* =====================================================
   USER LOGIN
===================================================== */

app.post("/login", async(req,res)=>{
  const {name,phone}=req.body;

  const [u]=await db.query(
    "SELECT * FROM users WHERE phone=?",[phone]);

  if(u.length) return res.json(u[0]);

  const[r]=await db.query(
    "INSERT INTO users(name,phone) VALUES(?,?)",
    [name,phone]);

  res.json({id:r.insertId,name,phone});
});

/* =====================================================
   REQUEST
===================================================== */

app.post("/request",async(req,res)=>{

  const {user_id,service_type,location}=req.body;

  const loc=`${location.lat},${location.lng}`;

  const[r]=await db.query(`
    INSERT INTO reports
    (user_id,service_type,status,location,created_at)
    VALUES(?,?, 'pending', ?,NOW())
  `,[user_id,service_type.toLowerCase(),loc]);

  const report={
    id:r.insertId,
    user_id,
    service_type,
    location:loc
  };

  io.to("control_"+service_type.toLowerCase())
    .emit("newReport",report);

  res.json(report);
});

/* =====================================================
   ASSIGN
===================================================== */

app.post("/assign",async(req,res)=>{

  const conn=await db.getConnection();

  try{

    const{reportId,responderId}=req.body;

    await conn.beginTransaction();

    // Check if report is already accepted
    const[[existing]]=await conn.query(
      "SELECT status FROM reports WHERE id=?",
      [reportId]);

    if(existing && existing.status === 'accepted')
      throw new Error("Cannot re-assign an already accepted report");

    // Remove any existing pending/rejected assignments for this report to allow re-assignment
    await conn.query(
      "DELETE FROM assignments WHERE report_id=? AND status IN ('pending', 'rejected')",
      [reportId]);

    await conn.query(`
      INSERT INTO assignments
      (report_id,responder_id,status,created_at)
      VALUES(?,?,'pending',NOW())
    `,[reportId,responderId]);

    await conn.query(
      "UPDATE reports SET status='assigned' WHERE id=?",
      [reportId]);

    io.to("responder_"+responderId)
      .emit("newAssignment",{reportId});

    await conn.commit();

    res.json({success:true});

  }catch(e){
    await conn.rollback();
    res.status(500).json({success:false, message: e.message});
  }finally{
    conn.release();
  }
});

/* =====================================================
   ACTIVE ASSIGNMENT (RESPONDER DASHBOARD)
===================================================== */

app.get("/active-assignment/:responderId", async (req, res) => {
  try {
    const responderId = req.params.responderId;

    const [rows] = await db.query(`
      SELECT
        a.id AS assignment_id,
        a.status AS assignment_status,
        r.id AS report_id,
        r.user_id,
        r.location,
        r.service_type,
        r.status AS report_status
      FROM assignments a
      JOIN reports r ON r.id = a.report_id
      WHERE a.responder_id = ?
      AND a.status IN ('pending','accepted')
      ORDER BY a.created_at DESC
      LIMIT 1
    `, [responderId]);

    if (rows.length === 0) {
      return res.status(404).json({
        message: "No active assignment"
      });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("Active assignment error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =====================================================
   ACTIVE REPORT (USER SIDE)
===================================================== */

app.get("/active-report/:userId", async (req, res) => {
  try {
    const [[report]] = await db.query(`
      SELECT r.*, a.responder_id, res.name AS responder_name, 
             res.latitude AS res_lat, res.longitude AS res_lng, res.service_type AS res_service
      FROM reports r
      LEFT JOIN (
        SELECT * FROM assignments 
        WHERE status != 'rejected'
        ORDER BY created_at DESC
        LIMIT 1
      ) a ON a.report_id = r.id
      LEFT JOIN responders res ON res.id = a.responder_id
      WHERE r.user_id = ? AND r.status != 'completed'
      ORDER BY r.created_at DESC
      LIMIT 1
    `, [req.params.userId]);

    if (!report) return res.status(404).json({ message: "No active report" });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* =====================================================
   ACCEPT ASSIGNMENT ✅ FINAL FIX
===================================================== */

app.post("/assignment-status", async (req, res) => {

  const conn = await db.getConnection();

  try {

    const { reportId, responderId, status } = req.body;

    await conn.beginTransaction();

    /* ---------- update assignment ---------- */
    await conn.query(
      `UPDATE assignments
       SET status=?
       WHERE report_id=? AND responder_id=?`,
      [status.toLowerCase(), reportId, responderId]
    );

    if (status.toLowerCase() === "accepted") {

      /* ---------- update states ---------- */
      await conn.query(
        "UPDATE responders SET status='busy' WHERE id=?",
        [responderId]
      );

      await conn.query(
        "UPDATE reports SET status='accepted' WHERE id=?",
        [reportId]
      );

      /* ---------- get report ---------- */
      const [[report]] = await conn.query(
        "SELECT user_id, service_type FROM reports WHERE id=?",
        [reportId]
      );

      /* ---------- get responder ---------- */
      const [[responder]] = await conn.query(
        "SELECT * FROM responders WHERE id=?",
        [responderId]
      );

      if (report && responder) {

        /* ===== SEND TO USER ===== */
        io.to("user_" + report.user_id)
          .emit("emergencyAccepted", {
            responder
          });

        /* ===== UPDATE CONTROL DASHBOARD ===== */
        io.to("control_" + report.service_type)
          .emit("assignmentUpdate");
      }
    } else if (status.toLowerCase() === "rejected") {
      /* Revert report status to pending if rejected */
      await conn.query(
        "UPDATE reports SET status='pending' WHERE id=?",
        [reportId]
      );

      const [[report]] = await conn.query(
        "SELECT service_type FROM reports WHERE id=?",
        [reportId]
      );

      if (report) {
        io.to("control_" + report.service_type)
          .emit("assignmentUpdate");
      }
    }

    await conn.commit();

    res.json({ success: true });

  } catch (err) {

    console.error("ASSIGNMENT STATUS ERROR:", err);

    await conn.rollback();

    res.status(500).json({
      success: false,
      message: err.message
    });

  } finally {
    conn.release();
  }
});

/* =====================================================
   COMPLETE
===================================================== */

app.post("/complete",async(req,res)=>{

  const{reportId,responderId}=req.body;

  await db.query(
    "UPDATE assignments SET status='completed' WHERE report_id=?",
    [reportId]);

  await db.query(
    "UPDATE reports SET status='completed' WHERE id=?",
    [reportId]);

  await db.query(
    "UPDATE responders SET status='available' WHERE id=?",
    [responderId]);

  res.json({success:true});
});

server.listen(5000,
 ()=>console.log("🚑 ERS SERVER RUNNING"));