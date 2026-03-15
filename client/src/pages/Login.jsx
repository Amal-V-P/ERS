import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { connectSocket } from "../socket";

const API = "https://ers-backend-7bvq.onrender.com";

function Login() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const navigate = useNavigate();

  const loginUser = async () => {
    if (!name.trim() || !phone.trim()) return alert("Enter name and phone");
    if (!/^[0-9]{10}$/.test(phone)) return alert("Enter valid 10 digit phone");

    try {
      const res = await axios.post(`${API}/login`, { name: name.trim(), phone });
      const user = res.data;

      localStorage.setItem("user", JSON.stringify(user));

      const socket = connectSocket();
      socket.emit("joinUser", user.id);

      navigate("/report");
    } catch (err) {
      console.error("Login error:", err);
      alert("Login failed");
    }
  };

  return (
    <div className="login-container">
      <h2>🚨 User Login</h2>
      <p>Enter your details to request emergency assistance</p>
      <input
        type="text"
        placeholder="Full Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="tel"
        placeholder="Phone Number (10 digits)"
        value={phone}
        maxLength={10}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
      />
      <button
        onClick={loginUser}
        disabled={!name.trim() || phone.length !== 10}
      >
        Login & Continue
      </button>
    </div>
  );
}

export default Login;