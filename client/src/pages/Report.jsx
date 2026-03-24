import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { connectSocket } from "../socket";
import LiveMap from "../components/LiveMap";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

function Report() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));

  const [service, setService] = useState("");
  const [reporting, setReporting] = useState(false);
  const [activeReports, setActiveReports] = useState([]);
  const [responderLocations, setResponderLocations] = useState({});
  const [userLocation, setUserLocation] = useState({ lat: null, lng: null });
  const [showForm, setShowForm] = useState(false);

  const watchIdRef = useRef(null);

  const fetchActive = async () => {
    try {
      const res = await axios.get(`${API}/active-report/${user.id}`);
      if (res.data) {
        setActiveReports(res.data);
        
        // Initialize locations for those already accepted
        const locs = {};
        res.data.forEach(r => {
          if (r.res_lat && r.res_lng) {
            locs[r.responder_id] = { lat: Number(r.res_lat), lng: Number(r.res_lng) };
          }
        });
        setResponderLocations(prev => ({ ...prev, ...locs }));
      }
    } catch (err) {
      console.log("No active report found or server error");
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }

    const socket = connectSocket();
    socket.emit("joinUser", user.id);

    fetchActive();

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLocation({ lat, lng });

          // Send live location to server
          socket.emit("userLocation", {
            userId: user.id,
            lat,
            lng,
          });
        },
        (err) => console.error("GPS Error:", err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }

    const handleEmergencyAccepted = () => {
      fetchActive();
    };

    const handleLiveLocation = (data) => {
      setResponderLocations((prev) => ({
        ...prev,
        [data.responderId]: { lat: Number(data.lat), lng: Number(data.lng) },
      }));
    };

    socket.on("emergencyAccepted", handleEmergencyAccepted);
    socket.on("liveResponderLocation", handleLiveLocation);
    socket.on("newReport", () => fetchActive()); // Refresh on any new report (could be from another tab)

    return () => {
      socket.off("emergencyAccepted", handleEmergencyAccepted);
      socket.off("liveResponderLocation", handleLiveLocation);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [user, navigate]);

  const reportEmergency = async () => {
    if (!service) return alert("Select a service");
    if (!userLocation.lat || !userLocation.lng) return alert("Cannot get your location");

    setReporting(true);
    try {
      const loc = { lat: userLocation.lat, lng: userLocation.lng };
      await axios.post(`${API}/request`, { user_id: user.id, service_type: service, location: loc });
      alert("🚨 Emergency Reported!");
      setShowForm(false);
      setService("");
      fetchActive();
    } catch (err) {
      console.error(err);
      alert("Failed to report emergency");
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2>🚨 Emergency Center</h2>
        <button 
          onClick={() => setShowForm(!showForm)} 
          style={{ width: "auto", marginTop: 0, padding: "8px 16px", backgroundColor: showForm ? "var(--text-muted)" : "var(--primary)" }}
        >
          {showForm ? "Cancel" : "New Emergency"}
        </button>
      </div>

      {(showForm || activeReports.length === 0) && (
        <div className="card card-warning">
          <h3>Request New Help</h3>
          <p className="text-muted">Select the type of emergency service you need.</p>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="">Select Required Service</option>
            <option value="Police">Police Department</option>
            <option value="Fire">Fire & Rescue</option>
            <option value="Medical">Medical / Ambulance</option>
          </select>

          <button
            disabled={!service || reporting || !userLocation.lat}
            onClick={reportEmergency}
          >
            {reporting ? "🚀 Dispatching..." : "🆘 Request Help Now"}
          </button>
          
          {!userLocation.lat && <p className="text-muted" style={{ color: "var(--primary)", marginTop: "10px" }}>📍 Waiting for GPS location...</p>}
        </div>
      )}

      {activeReports.map((report) => (
        <div key={report.id} className={`card ${report.status === 'accepted' ? 'card-success' : 'card-info'}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3>{report.service_type.toUpperCase()} - {report.status}</h3>
              <p className="text-muted">Report ID: #{report.id}</p>
            </div>
            <span className={`status-badge status-${report.status.toLowerCase()}`}>{report.status}</span>
          </div>

          {report.responder_id ? (
            <div style={{ textAlign: "left", margin: "15px 0" }}>
              <p><b>Responder:</b> {report.responder_name}</p>
              {responderLocations[report.responder_id] && (
                <div className="card card-compact" style={{ marginTop: "15px" }}>
                  <LiveMap
                    userLocation={userLocation}
                    responderLocation={responderLocations[report.responder_id]}
                  />
                </div>
              )}
            </div>
          ) : (
            <p style={{ marginTop: "15px" }}>Waiting for a responder to be assigned...</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default Report;