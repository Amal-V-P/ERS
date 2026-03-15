import { useEffect, useState } from "react";
import axios from "axios";
import { connectSocket, getSocket } from "../socket";

const API = "https://ers-backend-7bvq.onrender.com";

function Responder() {
  const [assignment, setAssignment] = useState(null);
  const responder = JSON.parse(localStorage.getItem("responder"));

  useEffect(() => {
    if (!responder) {
      window.location = "/";
      return;
    }

    // Connect socket
    const socket = connectSocket();
    socket.emit("joinResponder", responder.id);

    // Listen for new assignments
    const handleAssignment = (data) => {
      alert("🚨 Emergency Assigned");
      setAssignment(data);
    };

    socket.on("newAssignment", handleAssignment);

    return () => {
      socket.off("newAssignment", handleAssignment);
    };
  }, [responder]);

  const acceptEmergency = async () => {
    if (!assignment) return;

    try {
      // Send accept to backend
      await axios.post(`${API}/assignment-status`, {
        reportId: assignment.reportId,
        responderId: responder.id,
        status: "accepted"
      });

      alert("✅ Emergency Accepted");

      // Clear local assignment (optional: can navigate to dashboard)
      setAssignment(null);
    } catch (err) {
      console.error(err);
      alert("Accept failed");
    }
  };

  return (
    <div style={{ maxWidth: 450, margin: "50px auto", textAlign: "center" }}>
      <h2>🚓 Responder</h2>

      {assignment ? (
        <div style={{ border: "1px solid #ccc", padding: 15 }}>
          <h3>Emergency Assigned</h3>
          <p><b>Report ID:</b> {assignment.reportId}</p>
          <p><b>User ID:</b> {assignment.userId}</p>
          <p><b>Service:</b> {assignment.serviceType}</p>
          <button onClick={acceptEmergency} style={{ marginTop: 10, padding: 8, cursor: "pointer" }}>
            ✅ Accept Emergency
          </button>
        </div>
      ) : (
        <p>Waiting for assignment...</p>
      )}
    </div>
  );
}

export default Responder;