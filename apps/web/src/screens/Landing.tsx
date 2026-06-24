// apps/web/src/screens/Landing.tsx — the unauthenticated entry screen.
//
// AESTHETIC: "Full-bleed dark trophy room." A cinematic forest→near-black radial wash
// (with a faint pure-CSS topographic ring texture echoing the trail/woodcut brand) holds a
// single spotlit hero <Medal> as the centerpiece, with a compact paper sign-in card floating
// over it and a quiet "EARN IT. KEEP IT." signature line. Sign-in feels like stepping into a
// gallery. After the magic link is sent (props.sent) the form swaps for a calm "check your
// email" confirmation in the same card.
//
// NO-SCROLL CONTRACT: the root carries the global ".tm-landing" class, which already locks
// height to 100vh/100dvh with overflow:hidden — so this file sets NO height/overflow on the
// root. Everything is sized to FIT one viewport on desktop AND mobile, in BOTH the form and
// sent states. On mobile the grid gives the sign-in card a content-priority `auto` row at the
// TOP and puts the decorative medal in a shrink-to-fit `minmax(0,1fr)` row BELOW it — so when
// a short phone (incl. landscape) runs out of height, the FLEXIBLE medal row collapses/clips
// the decoration first; the card (form + [magic-link] note) keeps its full intrinsic height.
//
// Sign-in is passwordless magic-link: one email field → props.onSubmit (the parent App sends
// the link and flips props.sent). This screen makes no auth/network calls of its own.
import { useEffect, useState } from "react";
import { FONT_DISP, FONT_UI, T, RADIUS } from "../theme.js";
import { Medal } from "../badge/Medal.js";
import { SHOWCASE_EMBLEMS } from "../badge/showcaseEmblems.js";

export interface LandingProps {
  email: string;
  onEmailChange: (value: string) => void;
  sent: boolean; // true after the magic link was sent → show the confirmation state
  onSubmit: () => void; // call this on form submit; the parent (App) sends the link + flips `sent`
  mobile: boolean; // true when viewport < 760px
}

export function Landing(props: LandingProps) {
  const { email, onEmailChange, sent, onSubmit, mobile } = props;

  // The hero medal sells the product before sign-in: it CROSSFADES through a loop of real
  // showcase emblems instead of a blank placeholder. The emblems are stacked (all absolute,
  // inset 0) and cross-faded by opacity, so only the emblem ART changes — the medal frame +
  // typography stay rock-steady (no flicker, no re-layout). A `light` face + brass accent
  // reads warm on the dark trophy-room panel.
  const [emblemIdx, setEmblemIdx] = useState(0);
  useEffect(() => {
    if (SHOWCASE_EMBLEMS.length <= 1) return;
    const t = setInterval(
      () => setEmblemIdx((i) => (i + 1) % SHOWCASE_EMBLEMS.length),
      3200,
    );
    return () => clearInterval(t);
  }, []);

  const showcase = SHOWCASE_EMBLEMS.map((url, i) => (
    <div
      key={i}
      aria-hidden={i !== emblemIdx}
      style={{
        position: "absolute",
        inset: 0,
        opacity: i === emblemIdx ? 1 : 0,
        transition: "opacity 1100ms ease-in-out",
      }}
    >
      <Medal
        emblemUrl={url}
        raceName="Skyline Ridge 50"
        finishTime="4:12:30"
        dateLabel="OCT 4, 2025"
        distanceLabel="50 KM"
        faceTone="light"
        accent={T.brass}
      />
    </div>
  ));

  const submit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    onSubmit();
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: T.field,
    border: `1px solid ${T.border}`,
    borderRadius: RADIUS.input,
    padding: "13px 14px",
    fontFamily: FONT_UI,
    fontSize: 15,
    color: T.ink,
  };

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: T.forest,
    color: T.paper,
    border: "none",
    borderRadius: RADIUS.input,
    padding: "13px 16px",
    fontFamily: FONT_UI,
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: 0.3,
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(0,0,0,0.32)",
  };

  const linkBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: FONT_UI,
    fontWeight: 600,
    fontSize: 13,
    color: T.forest,
    textDecoration: "underline",
    textUnderlineOffset: 2,
  };

  // The sign-in card — paper surface floating over the dark room. Swaps form ⇄ confirmation.
  const card = (
    <div
      style={{
        width: "100%",
        maxWidth: 380,
        background: `${T.paper}f7`, // T.paper at ~0.97 alpha (near-opaque over the dark room)
        border: `1px solid ${T.borderSoft}`,
        borderRadius: RADIUS.card,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.2)",
        padding: mobile ? "18px 18px 20px" : "28px 30px 30px",
        animation: "tm-fadeup 0.5s ease both",
        boxSizing: "border-box",
      }}
    >
      {/* brand mark + wordmark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          marginBottom: mobile ? 12 : 18,
        }}
      >
        <BrandMark size={30} />
        <span
          style={{
            fontFamily: FONT_DISP,
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: 3,
            color: T.ink,
          }}
        >
          TRAILMARK
        </span>
      </div>

      {sent ? (
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: FONT_DISP,
              fontWeight: 700,
              fontSize: mobile ? 26 : 32,
              letterSpacing: 0.5,
              lineHeight: 1.04,
              color: T.ink,
            }}
          >
            CHECK YOUR EMAIL
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontFamily: FONT_UI,
              fontSize: 14.5,
              lineHeight: 1.5,
              color: T.mutedInk,
            }}
          >
            We sent a sign-in link to{" "}
            <strong style={{ color: T.ink, fontWeight: 700 }}>
              {email || "your inbox"}
            </strong>
            . Open it on this device to step into your trophy case.
          </p>
          {/* Dev-only hint: locally we skip the Resend send and print the link to the
              server log, so we point the developer at it. In a deployed build the user
              gets a real email and this is misleading — gate it on import.meta.env.DEV,
              which Vite statically replaces with `false` in `vite build`, so the whole
              block is dead-code-eliminated from the production bundle (never rendered). */}
          {import.meta.env.DEV && (
            <p
              style={{
                margin: "12px 0 0",
                padding: "11px 13px",
                background: T.rustTint,
                border: `1px solid ${T.rust}33`,
                borderRadius: RADIUS.input,
                fontFamily: FONT_UI,
                fontSize: 12.5,
                lineHeight: 1.5,
                color: T.mutedInk,
              }}
            >
              Running locally? It&rsquo;s printed in the server log as{" "}
              <code
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11.5,
                  background: T.field,
                  border: `1px solid ${T.hairline}`,
                  borderRadius: RADIUS.chip,
                  padding: "1px 6px",
                  color: T.ink,
                }}
              >
                [magic-link]
              </code>{" "}
              …
            </p>
          )}
          <button
            type="button"
            onClick={() => onEmailChange("")}
            style={{ ...linkBtn, marginTop: 14 }}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: FONT_DISP,
              fontWeight: 700,
              fontSize: mobile ? 28 : 36,
              letterSpacing: 0.5,
              lineHeight: 1.02,
              color: T.ink,
            }}
          >
            EVERY FINISH,
            <br />A MEDAL.
          </h1>
          <p
            style={{
              margin: "10px 0 16px",
              fontFamily: FONT_UI,
              fontSize: 14.5,
              lineHeight: 1.45,
              color: T.mutedInk,
            }}
          >
            Trail-running finisher badges — your own private trophy case. Sign
            in to start your collection.
          </p>

          <form
            onSubmit={submit}
            style={{ display: "flex", flexDirection: "column", gap: 11 }}
          >
            <input
              type="email"
              required
              aria-label="Email address"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              style={fieldStyle}
            />
            <button type="submit" style={primaryBtn}>
              Send sign-in link
            </button>
          </form>

          <p
            style={{
              margin: "12px 0 0",
              fontFamily: FONT_UI,
              fontSize: 12,
              lineHeight: 1.45,
              color: T.faint,
            }}
          >
            No password — we email you a one-time link.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="tm-landing"
      style={{
        position: "relative",
        // a cinematic forest wash, built ONLY from design tokens: a deep-forest glow at
        // top-center fading into the app's dark-surface token (T.dark — the same backdrop
        // used by the Studio preview + Badge detail).
        background: `radial-gradient(125% 95% at 50% 15%, ${T.paper} 0%, ${T.forest} 60%, ${T.forest} 100%)`,
        color: T.darkInk,
        display: "grid",
        gridTemplateColumns: mobile ? "1fr" : "1.05fr 0.95fr",
        // Mobile: the sign-in card gets a CONTENT-PRIORITY `auto` row at the TOP; the
        // decorative medal gets a SHRINK-TO-FIT `minmax(0,1fr)` row BELOW it. When a short
        // phone (incl. landscape) runs out of height, the flexible medal row collapses and
        // clips the DECORATION — the card (form + [magic-link] note) keeps full height and
        // stays fully on-screen. Desktop: one centered `1fr` row.
        gridTemplateRows: mobile ? "auto minmax(0, 1fr)" : "1fr",
        alignItems: mobile ? "stretch" : "center",
        gap: mobile ? 0 : 40,
        padding: mobile ? "0" : "0 clamp(28px, 6vw, 96px)",
      }}
    >
      {/* faint topographic ring texture — concentric "elevation" rings behind the medal,
          echoing the trail/woodcut brand. Desktop only (mobile drops it for no-scroll
          headroom + visual calm). Decorative, pointer-events:none, behind everything. */}
      {!mobile && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            backgroundImage: `repeating-radial-gradient(circle at 30% 46%, transparent 0 46px, ${T.brass}0d 46px 47px)`, // T.brass at ~0.05
          }}
        />
      )}

      {/* SIGN-IN — the floating card. On mobile it's the TOP `auto` row (never starved); on
          desktop it's the right-hand column (order:2). */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: mobile ? "center" : "flex-start",
          justifyContent: "center",
          minHeight: 0,
          padding: mobile ? "22px 22px 8px" : 0,
          order: mobile ? 1 : 2,
        }}
      >
        {card}
      </div>

      {/* SHOWCASE — the spotlit hero medal. On mobile it lives in the shrink-to-fit `1fr`
          row BELOW the card; overflow:hidden here means a starved track clips the medal
          cleanly (never the form). Centered so the clip eats it symmetrically. */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 0,
          overflow: mobile ? "hidden" : "visible",
          gap: mobile ? 8 : 22,
          padding: mobile ? "8px 24px 14px" : 0,
          order: mobile ? 2 : 1,
        }}
      >
        <div
          style={{
            position: "relative",
            width: mobile ? "min(26vh, 150px)" : "min(62vh, 460px)",
            maxWidth: "100%",
            aspectRatio: "1 / 1", // the crossfade layers are all position:absolute — give the box height
            flex: "none",
            // a soft warm glow pooling under the medal — the "spotlit in a gallery" feel.
            // The black drop is a true shadow; the warm halo is T.brass at ~0.26 alpha.
            filter: `drop-shadow(0 26px 46px rgba(0,0,0,0.6)) drop-shadow(0 0 60px ${T.brass}42)`,
          }}
        >
          {showcase}
        </div>
        {/* quiet signature line — grafted from the editorial-split direction */}
        <span
          style={{
            fontFamily: FONT_UI,
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            color: `${T.darkInk}80`, // T.darkInk at ~0.5 alpha
            flex: "none",
          }}
        >
          Earn it. Keep it.
        </span>
      </div>
    </div>
  );
}

/** The brand mark — a triangle inside a ringed circle (reused from the top bar / wordmark). */
function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${Math.round(size / 12)}px solid ${T.forest}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        flex: "none",
      }}
    >
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: `${size / 5}px solid transparent`,
          borderRight: `${size / 5}px solid transparent`,
          borderBottom: `${size / 3}px solid ${T.forest}`,
        }}
      />
    </div>
  );
}
