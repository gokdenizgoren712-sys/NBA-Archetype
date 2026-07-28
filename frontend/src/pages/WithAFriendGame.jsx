import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { useAuth } from "../contexts/AuthContext";
import { useGameSocket } from "../hooks/useGameSocket";
import HowItWorksPanel from "../game/HowItWorksPanel";
import MechanicsPanel from "../game/MechanicsPanel";
import WheelModePicker from "../game/WheelModePicker";
import { TargetIcon, WheelIcon, UsersIcon, TrophyIcon, CheckIcon, LinkIcon } from "../game/GameIcons";

export default function WithAFriendGame() {
  const { token, user, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const [wheelModeChoice, setWheelModeChoice] = useState("round");
  const [roomCode, setRoomCode] = useState(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const [serverState, setServerState] = useState(null); // son "state" mesajı: {room, usernames, pool, picks, connected_user_ids}

  const refreshRoom = useCallback((code) => {
    fetch(`/api/game/room/${code}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setServerState(prev => ({ ...prev, room: d, usernames: d.usernames })))
      .catch(() => {});
  }, [token]);

  const onSocketMessage = useCallback((data) => {
    if (data.type === "state") {
      setServerState(data);
    } else if (data.type === "opponent_joined" || data.type === "opponent_left") {
      if (roomCode) refreshRoom(roomCode);
    }
  }, [roomCode, refreshRoom]);

  const { connected, send } = useGameSocket(
    roomCode ? `/ws/game/room/${roomCode}` : null,
    token,
    { onMessage: onSocketMessage },
  );

  const createRoom = () => {
    setErrorMsg(""); setCreating(true);
    fetch("/api/game/room", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "friend", wheel_mode: wheelModeChoice }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.detail || "Could not create room");
        setRoomCode(d.room_code);
      })
      .catch(e => setErrorMsg(e.message))
      .finally(() => setCreating(false));
  };

  const joinRoom = () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length < 4) { setErrorMsg("Enter a valid room code"); return; }
    setErrorMsg(""); setJoining(true);
    fetch(`/api/game/room/${code}/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.detail || "Could not join room");
        setServerState(prev => ({ ...prev, room: d, usernames: d.usernames }));
        setRoomCode(code);
      })
      .catch(e => setErrorMsg(e.message))
      .finally(() => setJoining(false));
  };

  const copyCode = () => {
    if (!roomCode) return;
    navigator.clipboard?.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const room = serverState?.room;
  const usernames = serverState?.usernames || {};
  const myUserId = user?.id;
  const opponentUserId = room ? (room.player1_user_id === myUserId ? room.player2_user_id : room.player1_user_id) : null;
  const opponentUsername = opponentUserId ? usernames[opponentUserId] : null;
  const opponentConnected = !!opponentUserId;

  return (
    <div className="h-full overflow-y-auto">
      <SEO title="With a Friend — Lineup Builder" description="Challenge a friend to a head-to-head draft, from two different devices — same rules as Same Screen, synced live over the network." path="/game/friend" />
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-3 pb-6">
        <div>
          <h1 className="font-logo text-2xl font-bold text-white tracking-wide">With a Friend</h1>
          <p className="text-xs text-gray-500 mt-1">
            Same rules as Same Screen — Salary Cap, jokers, BAN, best-of-7 series — but you and your friend each play from your own device. Create a room and share the code, or join one.
          </p>
        </div>

        {!roomCode && (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_640px_340px] gap-4 justify-center max-w-[1400px] mx-auto">

            <div className="order-2 lg:order-1 space-y-3 min-w-0">
              <HowItWorksPanel
                steps={[
                  ["1", WheelIcon, "text-yamabuki", "Pick your wheel", "round- or pick-based"],
                  ["2", LinkIcon, "text-asagi", "Create or join", "share a room code"],
                  ["3", UsersIcon, "text-brandBlue", "Snake draft 9v9", "shared pool · salary cap"],
                  ["4", TrophyIcon, "text-yamabuki", "Best-of-7 series", "simulate to a champion"],
                ]}
                note={<>Each side plays from their own device — your pick shows up on your friend's screen the moment you make it. Same <span className="text-emerald-300 font-semibold">Salary Cap</span> rules as Same Screen.</>}
              />
            </div>

            <div className="order-1 lg:order-2 space-y-3">
              <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5 flex items-center justify-center gap-5">
                <div className="flex-1 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full border-2 border-brandBlue/60 bg-brandBlue/10 flex items-center justify-center text-brandBlue"><UsersIcon size={24} /></div>
                  <div className="font-logo text-sm font-bold text-white mt-2">{user?.username || "You"}</div>
                </div>
                <div className="font-logo text-2xl font-black text-gray-600">VS</div>
                <div className="flex-1 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full border-2 border-brandRed/60 bg-brandRed/10 flex items-center justify-center text-brandRed"><UsersIcon size={24} /></div>
                  <div className="font-logo text-sm font-bold text-gray-500 mt-2">A friend</div>
                </div>
              </div>

              {!isLoggedIn ? (
                <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5 text-center space-y-3">
                  <p className="text-sm text-gray-400">You need to be logged in to create or join a room.</p>
                  <button onClick={() => navigate("/login")}
                    className="px-8 py-2.5 rounded-xl font-logo font-bold text-darkBg bg-yamabuki hover:bg-white transition-colors">
                    Log In
                  </button>
                </div>
              ) : (
                <>
                  <WheelModePicker value={wheelModeChoice} onChange={setWheelModeChoice} />

                  <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-4 space-y-3">
                    <button onClick={createRoom} disabled={creating}
                      className="w-full px-6 py-3 rounded-xl font-logo font-bold text-lg inline-flex items-center justify-center gap-2 transition-colors duration-200 text-darkBg bg-yamabuki hover:bg-white disabled:opacity-60 shadow-[0_0_20px_rgba(255,177,27,0.3)]">
                      <WheelIcon size={17} /> {creating ? "Creating…" : "Create Room"}
                    </button>

                    <div className="flex items-center gap-2 text-[10px] text-gray-600 uppercase tracking-widest">
                      <div className="flex-1 h-px bg-gray-800" /> or join <div className="flex-1 h-px bg-gray-800" />
                    </div>

                    <div className="flex gap-2">
                      <input value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                        placeholder="ROOM CODE" maxLength={8}
                        className="flex-1 min-w-0 bg-surfaceCard border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest text-white placeholder:text-gray-600 focus:outline-none focus:border-yamabuki/60" />
                      <button onClick={joinRoom} disabled={joining}
                        className="px-5 py-2.5 rounded-lg font-logo font-bold text-sm border border-gray-700 text-white hover:border-yamabuki/60 disabled:opacity-60 transition-colors">
                        {joining ? "Joining…" : "Join"}
                      </button>
                    </div>
                    {errorMsg && <p className="text-[11px] text-red-400">{errorMsg}</p>}
                  </div>
                </>
              )}
            </div>

            <div className="order-3 space-y-3 min-w-0">
              <MechanicsPanel />
            </div>

          </div>
        )}

        {roomCode && (
          <div className="max-w-md mx-auto text-center bg-surfaceBg border border-gray-800 rounded-2xl p-6 space-y-4">
            {!connected && (
              <p className="text-sm text-gray-500 animate-pulse">Connecting…</p>
            )}

            {connected && !opponentConnected && (
              <>
                <div className="text-[11px] text-gray-500 uppercase tracking-widest">Room Code — share this with your friend</div>
                <div className="flex items-center justify-center gap-2">
                  <div className="font-logo text-4xl font-black text-yamabuki tracking-[0.2em]">{roomCode}</div>
                  <button onClick={copyCode} title="Copy code"
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-yamabuki/60 transition-colors">
                    {copied ? <CheckIcon size={16} /> : <LinkIcon size={16} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 animate-pulse">Waiting for your friend to join…</p>
              </>
            )}

            {connected && opponentConnected && (
              <>
                <div className="flex items-center justify-center gap-1.5 text-emerald-300 text-sm font-logo font-bold">
                  <CheckIcon size={16} /> Connected
                </div>
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto rounded-full border-2 border-brandBlue/60 bg-brandBlue/10 flex items-center justify-center text-brandBlue"><UsersIcon size={20} /></div>
                    <div className="font-logo text-xs font-bold text-white mt-1.5">{user?.username}</div>
                  </div>
                  <div className="font-logo text-lg font-black text-gray-600">VS</div>
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto rounded-full border-2 border-brandRed/60 bg-brandRed/10 flex items-center justify-center text-brandRed"><UsersIcon size={20} /></div>
                    <div className="font-logo text-xs font-bold text-white mt-1.5">{opponentUsername || "…"}</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Draft setup is coming in the next update — the room, connection and matchmaking are live.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
