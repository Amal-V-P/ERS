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
  const [assignedResponder, setAssignedResponder] = useState(null);
  const [responderLocation, setResponderLocation] = useState(null);
  const [userLocation, setUserLocation] = useState({ lat: null, lng: null });

  const assignedResponderRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }

    const socket = connectSocket();
    socket.emit("joinUser", user.id);

    // Fetch existing active report
    const fetchActive = async () => {
      try {
        const res = await axios.get(`${API}/active-report/${user.id}`);
        if (res.data) {
          const r = res.data;
          if (r.responder_id && r.status === 'accepted') {
            const responder = {
              id: r.responder_id,
              name: r.responder_name,
              service_type: r.res_service
            };
            assignedResponderRef.current = responder;
            setAssignedResponder(responder);
            if (r.res_lat && r.res_lng) {
              setResponderLocation({ lat: Number(r.res_lat), lng: Number(r.res_lng) });
            }
          }
        }
      } catch (err) {
        console.log("No active report found or server error");
      }
    };
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
    } else {
      alert("Geolocation not supported");
    }

    const handleEmergencyAccepted = (data) => {
      assignedResponderRef.current = data.responder;
      setAssignedResponder(data.responder);

      if (data.responder.latitude && data.responder.longitude) {
        setResponderLocation({
          lat: Number(data.responder.latitude),
          lng: Number(data.responder.longitude),
        });
      }
    };

    const handleLiveLocation = (data) => {
      if (
        assignedResponderRef.current &&
        data.responderId === assignedResponderRef.current.id
      ) {
        setResponderLocation({ lat: Number(data.lat), lng: Number(data.lng) });
      }
    };

    socket.on("emergencyAccepted", handleEmergencyAccepted);
    socket.on("liveResponderLocation", handleLiveLocation);

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
    } catch (err) {
      console.error(err);
      alert("Failed to report emergency");
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="dashboard-container">
      <h2>🚨 Emergency Report Center</h2>

      {!assignedResponder ? (
        <div className="card">
          <p>Please select the type of emergency service you need and provide your location permission to get help as fast as possible.</p>
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
            {reporting ? "🚀 Dispatching Help..." : "🆘 Request Emergency Help"}
          </button>
          
          {!userLocation.lat && <p style={{ color: "var(--primary-color)", fontSize: "0.9rem", marginTop: "10px" }}>📍 Waiting for GPS location...</p>}
        </div>
      ) : (
        <div className="card card-success">
          <h3>Help is on the way! ✅</h3>
          <div style={{ textAlign: "left", margin: "15px 0" }}>
            <p><b>Responder:</b> {assignedResponder.name}</p>
            <p><b>Service Type:</b> <span className="status-badge status-assigned">{assignedResponder.service_type}</span></p>
            {responderLocation && (
              <p><b>Status:</b> <span className="status-badge status-accepted">Live Tracking Active</span></p>
            )}
          </div>
        </div>
      )}

      {userLocation.lat && (
        <div className="card card-compact">
          <LiveMap
            userLocation={userLocation}
            responderLocation={responderLocation}
          />
        </div>
      )}
    </div>
  );
}

export default Report;