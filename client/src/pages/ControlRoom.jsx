import { useEffect, useState } from "react";
import { connectSocket } from "../socket";
import axios from "axios";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

function ControlRoom() {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const socket = connectSocket();
    socket.emit("joinControl", "Police"); // could be dynamic later

    const handleNewReport = (data) => {
      setReports((prev) => [...prev, data]);
    };

    socket.on("newReport", handleNewReport);

    return () => {
      socket.off("newReport", handleNewReport);
    };
  }, []);

  const assignResponder = async (report_id, responder_id) => {
    if (!responder_id) return;
    try {
      await axios.post(`${API}/assign`, { report_id, responder_id });
      alert(`Assigned Responder ${responder_id} to report ${report_id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <h2>Police Control Room</h2>
      {reports.length === 0 && <p>No pending reports</p>}
      {reports.map((r) => (
        <div key={r.report_id} style={{ border: "1px solid #ccc", padding: "8px", margin: "8px 0" }}>
          <p>Report ID: {r.report_id}</p>
          <p>User ID: {r.user_id}</p>
          <button onClick={() => assignResponder(r.report_id, 1)}>Assign Unit 1</button>
        </div>
      ))}
    </>
  );
}

export default ControlRoom;