import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { connectSocket } from "../socket";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

const API = "https://ers-backend-7bvq.onrender.com";

/* ================= ICONS ================= */
const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
});

const responderIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/2967/2967350.png",
  iconSize: [35, 35],
  iconAnchor: [17, 35],
  popupAnchor: [0, -35],
});

/* ================= AUTO FIT ================= */
function FitBounds({ userLocs, resLocs }) {
  const map = useMap();
  useEffect(() => {
    const points = [];
    Object.values(userLocs).forEach(l => points.push([l.lat, l.lng]));
    Object.values(resLocs).forEach(l => points.push([l.lat, l.lng]));
    
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [userLocs, resLocs, map]);
  return null;
}

/* ================= SAFE LOCAL STORAGE ================= */
function getControlRoom() {
  try {
    const data = localStorage.getItem("controlRoom");
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    console.error("Invalid controlRoom data:", err);
    localStorage.removeItem("controlRoom");
    return null;
  }
}

function ControlDashboard() {
  const navigate = useNavigate();
  const [control, setControl] = useState(getControlRoom());
  const [reports, setReports] = useState([]);
  const [responders, setResponders] = useState([]);
  const [liveLocations, setLiveLocations] = useState({});
  const [userLocations, setUserLocations] = useState({});
  const [selectedResponder, setSelectedResponder] = useState({});

  /* ================= LOAD DATA ================= */
  const loadData = async () => {
    if (!control?.service) return;

    try {
      const [reportsRes, respondersRes] = await Promise.all([
        axios.get(`${API}/reports/${control.service.toLowerCase()}`),
        axios.get(`${API}/responders/${control.service.toLowerCase()}`),
      ]);

      const fetchedReports = reportsRes.data || [];
      setReports(fetchedReports);
      setResponders(respondersRes.data || []);

      // Initialize user locations from reports
      const uLocs = {};
      fetchedReports.forEach(r => {
        if(r.location) {
          const [lat, lng] = r.location.split(",").map(Number);
          uLocs[r.user_id] = { lat, lng };
        }
      });
      setUserLocations(prev => ({ ...uLocs, ...prev })); // Merge with any live updates

      // Initialize liveLocations from responders
      const locations = {};
      (respondersRes.data || []).forEach((r) => {
        if (r.latitude !== null && r.longitude !== null) {
          locations[r.id] = {
            lat: Number(r.latitude),
            lng: Number(r.longitude),
          };
        }
      });
      setLiveLocations(prev => ({ ...locations, ...prev }));
    } catch (err) {
      console.error("Load data error:", err);
    }
  };

  /* ================= SOCKET + INIT ================= */
  useEffect(() => {
    if (!control?.service) {
      navigate("/control-login");
      return;
    }

    const socket = connectSocket();

    const joinRoom = () => socket.emit("joinControl", control.service);
    if (socket.connected) joinRoom();
    else socket.once("connect", joinRoom);

    const handleNewReport = () => loadData();
    const handleAssignmentUpdate = () => loadData();
    
    const handleResponderLoc = (data) => {
      if (!data) return;
      setLiveLocations((prev) => ({
        ...prev,
        [data.responderId]: { lat: Number(data.lat), lng: Number(data.lng) },
      }));
    };

    const handleUserLoc = (data) => {
      if (!data) return;
      setUserLocations((prev) => ({
        ...prev,
        [data.userId]: { lat: Number(data.lat), lng: Number(data.lng) },
      }));
    };

    socket.on("newReport", handleNewReport);
    socket.on("assignmentUpdate", handleAssignmentUpdate);
    socket.on("liveResponderLocation", handleResponderLoc);
    socket.on("liveUserLocation", handleUserLoc);

    loadData();

    return () => {
      socket.off("newReport", handleNewReport);
      socket.off("assignmentUpdate", handleAssignmentUpdate);
      socket.off("liveResponderLocation", handleResponderLoc);
      socket.off("liveUserLocation", handleUserLoc);
      socket.off("connect", joinRoom);
    };
  }, [control, navigate]);

  /* ================= UI ================= */
  return (
    <div className="dashboard-container" style={{ maxWidth: "1200px" }}>
      <h2>🚨 {control.service.toUpperCase()} CONTROL CENTER</h2>

      {/* ===== LIVE FLEET MAP ===== */}
      <div className="card" style={{ padding: 0, overflow: "hidden", height: "450px", marginBottom: "30px" }}>
        <MapContainer center={[20, 78]} zoom={5} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          
          <FitBounds userLocs={userLocations} resLocs={liveLocations} />

          {/* USER MARKERS */}
          {Object.entries(userLocations).map(([userId, loc]) => (
            <Marker key={`user-${userId}`} position={[loc.lat, loc.lng]} icon={userIcon}>
              <Popup>User #{userId} (Report Active)</Popup>
            </Marker>
          ))}

          {/* RESPONDER MARKERS */}
          {Object.entries(liveLocations).map(([resId, loc]) => (
            <Marker key={`res-${resId}`} position={[loc.lat, loc.lng]} icon={responderIcon}>
              <Popup>Responder #{resId}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* ===== ACTIVE REPORTS ===== */}
        <div>
          <h3>Active Reports</h3>
          {reports.length === 0 && <div className="card"><p>No active reports.</p></div>}
          {reports.map((r) => (
            <div key={r.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>Report #{r.id}</strong>
                <span className={`status-badge status-${r.status.toLowerCase()}`}>{r.status}</span>
              </div>
              <p style={{ fontSize: "0.9rem", margin: "5px 0" }}>User ID: {r.user_id}</p>
              
              {(r.status.toLowerCase() === "pending" || r.status.toLowerCase() === "assigned") && (
                <div style={{ marginTop: 10, display: "flex", gap: "10px" }}>
                  <select 
                    style={{ padding: "5px" }}
                    onChange={(e) => setSelectedResponder(prev => ({ ...prev, [r.id]: e.target.value }))}
                  >
                    <option value="">Select Responder</option>
                    {responders
                      .filter(res => res.status.toLowerCase() === "available")
                      .map(res => (
                        <option key={res.id} value={res.id}>{res.name}</option>
                      ))}
                  </select>
                  <button 
                    style={{ width: "auto", marginTop: 0, padding: "5px 15px" }}
                    onClick={async () => {
                      const resId = selectedResponder[r.id];
                      if(!resId) return alert("Select a responder");
                      try {
                        await axios.post(`${API}/assign`, { reportId: r.id, responderId: resId });
                        alert("Assigned successfully");
                        loadData();
                      } catch (err) {
                        alert(err.response?.data?.message || "Assignment failed");
                      }
                    }}
                  >
                    {r.status.toLowerCase() === "assigned" ? "Re-assign" : "Assign"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ===== RESPONDER STATUS ===== */}
        <div>
          <h3>Responder Fleet</h3>
          <div className="card">
            {responders.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                <div>
                  <strong>{r.name}</strong>
                  <div style={{ fontSize: "0.8rem", color: "#666" }}>ID: {r.id}</div>
                </div>
                <span className={`status-badge status-${r.status.toLowerCase()}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ControlDashboard;