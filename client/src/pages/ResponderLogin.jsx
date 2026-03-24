import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { connectSocket, getSocket } from "../socket";

function ResponderLogin() {
  const [responderId, setResponderId] = useState("");
  const navigate = useNavigate();

  const login = () => {
    if (!responderId.trim()) return alert("Enter Responder ID");

    const responder = {
      id: Number(responderId),
      name: "Responder " + responderId,
    };

    localStorage.setItem("responder", JSON.stringify(responder));

    connectSocket();
    const socket = getSocket();
    socket.emit("joinResponder", responder.id);

    navigate("/responder/dashboard");
  };

  return (
    <div className="login-container">
      <h2>🚑 Responder Login</h2>
      <p>Enter your responder ID to start your shift</p>
      <input
        type="number"
        placeholder="Responder ID"
        value={responderId}
        onChange={(e) => setResponderId(e.target.value)}
      />
      <button
        onClick={login}
        disabled={!responderId.trim()}
      >
        Go Online
      </button>
    </div>
  );
}

export default ResponderLogin;