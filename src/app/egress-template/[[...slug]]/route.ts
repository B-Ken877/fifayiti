// Egress custom recording template — serves the SAME page for any path
// suffix (/egress-template, /egress-template/tv, ...) because livekit-egress
// appends the layout name to customBaseUrl.
//
// How it works (docs.livekit.io/transport/media/ingress-egress/egress/custom-template):
//   • The egress service launches headless Chrome pointed at this page with
//     ?url=<livekit ws url>&token=<recorder token>&layout=<name>
//   • We connect to the room and subscribe ONLY to the camera the operator
//     put on air (participant metadata.slot === room metadata.selectedSlot)
//   • console.log("START_RECORDING") tells egress to begin capturing
//
// This is what makes the HLS broadcast follow the operator's "VOYE SOU TV"
// selection: one continuous egress for the whole match, switching cameras
// inside the template — DVR continuity is preserved across camera switches.

export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; background: #000; width: 100%; height: 100%; overflow: hidden; }
  #video { width: 100vw; height: 100vh; object-fit: contain; background: #000; }
  #offline {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: #084C2A; font-family: Arial, sans-serif; font-size: 42px; font-weight: bold;
    letter-spacing: 8px; background: #000;
  }
</style>
</head>
<body>
  <video id="video" autoplay muted playsinline></video>
  <audio id="audio" autoplay></audio>
  <div id="offline">FIFAYITI</div>
  <script src="/livekit-client.umd.js"></script>
  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      var lkUrl = params.get("url") || params.get("ws_url");
      var token = params.get("token") || params.get("access_token");
      if (!lkUrl || !token) return;

      var videoEl = document.getElementById("video");
      var audioEl = document.getElementById("audio");
      var offlineEl = document.getElementById("offline");

      var LK = window.LivekitClient || window.LiveKit;
      if (!LK) return;
      var room = new LK.Room({ autoSubscribe: false, adaptiveStream: false });
      var attachedIdentity = null;

      function metaOf(p) {
        try { return JSON.parse(p.metadata || "{}"); } catch (e) { return {}; }
      }
      function roomSlot() {
        try { return JSON.parse(room.metadata || "{}").selectedSlot; } catch (e) { return null; }
      }
      function selectedParticipant() {
        var slot = roomSlot();
        if (slot == null) return null;
        var it = room.remoteParticipants.values();
        for (var p of it) {
          if (metaOf(p).slot === slot) return p;
        }
        return null;
      }

      // ── Frame watchdog ──────────────────────────────────────────────
      // A "connected" camera can still deliver ZERO frames (phone tab
      // backgrounded on Android, stalled uplink). Without this check the
      // recording shows elegant BLACK instead of an honest placeholder.
      // We track the last time video.currentTime advanced; if frozen > 4s
      // while a participant is attached, show the offline overlay. When
      // frames resume, hide it again.
      var lastAdvanceAt = Date.now();
      var lastPosition = 0;
      setInterval(function () {
        var t = videoEl.currentTime;
        if (t > lastPosition + 0.1) {
          lastAdvanceAt = Date.now();
          lastPosition = t;
          if (videoEl.srcObject) offlineEl.style.display = "none";
        } else if (videoEl.srcObject && Date.now() - lastAdvanceAt > 4000) {
          // Frames stopped flowing → honest placeholder over the black
          offlineEl.style.display = "flex";
        }
      }, 1000);

      function attach() {
        var p = selectedParticipant();
        if (!p) {
          videoEl.srcObject = null;
          audioEl.srcObject = null;
          attachedIdentity = null;
          lastAdvanceAt = 0; // force placeholder until frames resume
          offlineEl.style.display = "flex";
          return;
        }
        p.trackPublications.forEach(function (pub) {
          if (pub.kind !== "video" && pub.kind !== "audio") return;
          var isVideo = pub.kind === "video";
          if (!pub.isSubscribed) { try { pub.setSubscribed(true); } catch (e) {} }
          if (isVideo && pub.videoTrack && attachedIdentity !== p.identity) {
            videoEl.srcObject = null;
            lastAdvanceAt = 0; // placeholder until first frames arrive
            offlineEl.style.display = "flex";
            pub.videoTrack.attach(videoEl);
            attachedIdentity = p.identity;
          }
          if (!isVideo && pub.audioTrack) {
            audioEl.srcObject = null;
            pub.audioTrack.attach(audioEl);
          }
        });
        // Unsubscribe everyone else's tracks (other cameras)
        room.remoteParticipants.forEach(function (other) {
          if (other === p) return;
          other.trackPublications.forEach(function (pub) {
            if (pub.isSubscribed) { try { pub.setSubscribed(false); } catch (e) {} }
          });
        });
      }

      function reattach() {
        attachedIdentity = null;
        attach();
      }

      room
        .on("participantConnected", attach)
        .on("participantDisconnected", reattach)
        .on("participantMetadataChanged", attach)
        .on("roomMetadataChanged", reattach)
        .on("trackSubscribed", attach)
        .on("trackUnsubscribed", attach)
        .on("connected", function () {
          console.log("START_RECORDING");
          attach();
        });

      room.connect(lkUrl, token).catch(function (e) {
        console.error("template connect failed", e);
      });
    })();
  </script>
</body>
</html>`;

export async function GET() {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
