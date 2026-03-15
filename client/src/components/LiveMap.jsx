import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";

/* ================= ICONS ================= */

const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
  iconSize: [35, 35],
  iconAnchor: [17, 35],
  popupAnchor: [0, -35],
});

const responderIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/2967/2967350.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

/* ================= AUTO FIT BOUNDS ================= */

function FitBounds({ userLoc, resLoc }) {
  const map = useMap();

  useEffect(() => {
    if (userLoc?.lat && resLoc?.lat) {
      const bounds = L.latLngBounds([
        [userLoc.lat, userLoc.lng],
        [resLoc.lat, resLoc.lng],
      ]);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (userLoc?.lat) {
      map.setView([userLoc.lat, userLoc.lng], 15);
    }
  }, [userLoc, resLoc, map]);

  return null;
}

/* ================= LIVE MAP ================= */

function LiveMap({ userLocation, responderLocation }) {

  if (!userLocation?.lat || !userLocation?.lng)
    return null;

  return (
    <MapContainer
      center={[userLocation.lat, userLocation.lng]}
      zoom={15}
      style={{ height: 400, marginTop: 0 }}
    >
      <TileLayer
        attribution="© OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Auto fit both markers */}
      <FitBounds userLoc={userLocation} resLoc={responderLocation} />

      {/* USER MARKER */}
      <Marker
        position={[userLocation.lat, userLocation.lng]}
        icon={userIcon}
      >
        <Popup>You 📍</Popup>
      </Marker>

      {/* RESPONDER MARKER */}
      {responderLocation && (
        <Marker
          position={[
            responderLocation.lat,
            responderLocation.lng,
          ]}
          icon={responderIcon}
        >
          <Popup>Responder 🚑</Popup>
        </Marker>
      )}

    </MapContainer>
  );
}

export default LiveMap;