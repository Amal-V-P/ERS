import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { connectSocket } from "../socket";

function ControlRoomLogin() {
  const [service, setService] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const login = () => {
    if (!service) return alert("Select a service");
    if (password !== "123") return alert("Wrong password");

    localStorage.setItem("controlRoom", JSON.stringify({ service }));

    const socket = connectSocket();
    socket.emit("joinControl", service);

    navigate("/control-dashboard");
  };

  return (
    <div className="login-container">
      <h2>🏢 Control Room Login</h2>
      <p>Select your department to access the dashboard</p>

      <select value={service} onChange={(e) => setService(e.target.value)}>
        <option value="">Select Service</option>
        <option value="Police">Police</option>
        <option value="Fire">Fire</option>
        <option value="Medical">Medical</option>
      </select>

      <input
        type="password"
        placeholder="Enter Access Code"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={login}>Access Dashboard</button>

      <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "center" }}>
        <a href="/" className="text-muted" style={{ textDecoration: "none" }}>User Login</a>
        <span className="text-muted">|</span>
        <a href="/responder" className="text-muted" style={{ textDecoration: "none" }}>Responder Login</a>
      </div>
    </div>
  );
}

export default ControlRoomLogin;