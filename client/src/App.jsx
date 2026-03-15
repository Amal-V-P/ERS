import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import ControlRoomLogin from "./pages/ControlRoomLogin";
import ControlDashboard from "./pages/ControlDashboard";
import Report from "./pages/Report";
import ResponderDashboard from "./pages/ResponderDashboard";
import ResponderLogin from "./pages/ResponderLogin";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/control-login" element={<ControlRoomLogin />} />
        <Route path="/control-dashboard" element={<ControlDashboard />} />
        <Route path="/report" element={<Report />} />
        <Route path="/responder-login" element={<ResponderLogin />} />
        <Route path="/responder-dashboard" element={<ResponderDashboard />} />
        <Route path="*" element={<h2>Page Not Found</h2>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;