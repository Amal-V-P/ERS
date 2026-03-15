import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { connectSocket, getSocket } from "../socket";
import LiveMap from "../components/LiveMap";

const API = "https://ers-backend-7bvq.onrender.com";

function ResponderDashboard() {
  const navigate = useNavigate();
  const responder = JSON.parse(localStorage.getItem("responder"));
  const [assignment, setAssignment] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentLoc, setCurrentLoc] = useState(null);
  const watchRef = useRef(null);

  useEffect(() => {
    if (!responder) {
      navigate("/responder-login");
      return;
    }

    const socket = connectSocket();
    socket.emit("joinResponder", responder.id);

    const handleAssignment = (data) => {
      alert("🚨 New Emergency Assigned");
      fetchActiveAssignment(); // Re-fetch to get full details including location
    };

    const handleUserLocation = (data) => {
      setAssignment((prev) => {
        if (!prev) return prev;
        return { ...prev, location: { lat: data.lat, lng: data.lng } };
      });
    };

    socket.on("newAssignment", handleAssignment);
    socket.on("liveUserLocation", handleUserLocation);

    fetchActiveAssignment();

    return () => {
      socket.off("newAssignment", handleAssignment);
      socket.off("liveUserLocation", handleUserLocation);
      stopTracking();
    };
  }, []);

  const fetchActiveAssignment = async () => {
    try {
      const res = await axios.get(`${API}/active-assignment/${responder.id}`);
      if (res.data) {
        const data = res.data;
        
        // Parse "lat,lng" string into object
        let parsedLocation = null;
        if (data.location) {
          const [lat, lng] = data.location.split(",").map(Number);
          parsedLocation = { lat, lng };
        }

        setAssignment({
          reportId: data.report_id,
          userId: data.user_id,
          serviceType: data.service_type,
          status: data.assignment_status,
          location: parsedLocation
        });
        
        if (data.assignment_status === "accepted") setTracking(true);
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        setAssignment(null);
      } else {
        console.error("Fetch active assignment error:", err);
      }
    }
  };

  useEffect(() => {
    if (!tracking || !responder) return;

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCurrentLoc({ lat: latitude, lng: longitude });
        
        const socket = getSocket();
        socket.emit("responderLocation", {
          responderId: responder.id,
          lat: latitude,
          lng: longitude,
        });
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return stopTracking;
  }, [tracking, responder]);

  const stopTracking = () => {
    if (watchRef.current) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  };

  const updateStatus = async (status) => {
    if (!assignment) return;
    setLoading(true);
    try {
      await axios.post(`${API}/assignment-status`, {
        reportId: assignment.reportId,
        responderId: responder.id,
        status,
      });
      if (status === "accepted") setTracking(true);
      if (status === "rejected") setAssignment(null);
      fetchActiveAssignment(); // Refresh data
    } catch (err) {
      console.error("Update status error:", err);
      alert("Update failed");
    }
    setLoading(false);
  };

  const completeEmergency = async () => {
    if (!assignment) return;
    try {
      await axios.post(`${API}/complete`, {
        reportId: assignment.reportId,
        responderId: responder.id,
      });
      stopTracking();
      setTracking(false);
      setAssignment(null);
      setCurrentLoc(null);
      alert("✅ Emergency Completed");
    } catch (err) {
      console.error("Complete emergency error:", err);
      alert("Failed to complete emergency");
    }
  };

  return (
    <div className="dashboard-container">
      <h2>🚑 Responder Dashboard</h2>
      <div className="card">
        <p><b>Status:</b> {tracking ? <span className="status-badge status-accepted">Live Tracking Active ✅</span> : <span className="status-badge status-available">Idle / Waiting</span>}</p>
      </div>

      {assignment ? (
        <div className="card" style={{ borderLeft: "5px solid var(--primary-color)" }}>
          <h3>Emergency Assigned</h3>
          <div style={{ textAlign: "left", marginBottom: 15 }}>
            <p><b>Report ID:</b> {assignment.reportId}</p>
            <p><b>User ID:</b> {assignment.userId}</p>
            <p><b>Service:</b> <span className="status-badge status-assigned">{assignment.serviceType}</span></p>
          </div>

          {assignment.location && (
            <div style={{ borderRadius: "8px", overflow: "hidden", marginBottom: "15px", border: "1px solid #ddd" }}>
              <LiveMap 
                userLocation={assignment.location} 
                responderLocation={currentLoc}
              />
            </div>
          )}

          {!tracking && (
            <div style={{ display: "flex", gap: "10px" }}>
              <button disabled={loading} onClick={() => updateStatus("accepted")} style={{ backgroundColor: "#2a9d8f" }}>Accept</button>
              <button disabled={loading} onClick={() => updateStatus("rejected")} style={{ backgroundColor: "#e76f51" }}>Reject</button>
            </div>
          )}

          {tracking && (
            <button onClick={completeEmergency} style={{ backgroundColor: "#264653" }}>✅ Mark as Completed</button>
          )}
        </div>
      ) : (
        <div className="card">
          <p>Waiting for new emergency reports...</p>
        </div>
      )}
    </div>
  );
}

export default ResponderDashboard;