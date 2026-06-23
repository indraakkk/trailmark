// apps/web/src/App.tsx — the orchestration backbone for the revamp.
//
// Two first-class surfaces — Collection (home / trophy case) and Studio (generator) —
// plus a Badge detail/share view and a Design-system reference. App owns DATA (session,
// badges, credits) and ACTIONS (generate / tweak / retry-in-place / set-keeper / delete /
// share); each screen owns its own ephemeral UI state. Re-generation (Tweak) makes a NEW
// row; Retry of a FAILED badge fixes it IN PLACE (same row, no new tile).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BadgeView } from "@trailmark/contract";
import {
  authClient,
  credits as fetchCredits,
  gallery,
  generate,
  one,
  regenerate,
  remove as removeBadge,
  retry as retryBadge,
  sendMagicLink,
  setKeeper as setKeeperApi,
  signOut,
} from "./api.js";
import type { Force } from "./api.js";
import { FONT_UI, T } from "./theme.js";
import { defaultForm, formToInputs, inputsToForm } from "./presets.js";
import { buildCollection } from "./lib.js";
import type { StudioForm, View } from "./types.js";
import { TopBar } from "./screens/TopBar.js";
import { Collection } from "./screens/Collection.js";
import { Studio } from "./screens/Studio.js";
import { BadgeDetail } from "./screens/BadgeDetail.js";
import { Landing } from "./screens/Landing.js";

type Session = "loading" | null | { userId: string; email: string };

// Cosmetic only: hide the demo-failure control for non-demo users. The SERVER gate
// (submit.ts, DEMO_ACCOUNT_EMAIL) is authoritative — this just avoids showing a no-op.
const DEMO_EMAIL = "indrakoslab@gmail.com";

export function App() {
  const [session, setSession] = useState<Session>("loading");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const [badges, setBadges] = useState<ReadonlyArray<BadgeView>>([]);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  const [view, setView] = useState<View>("collection");
  const [detailId, setDetailId] = useState<string | null>(null);

  const [studioMode, setStudioMode] = useState<"create" | "tweak">("create");
  const [studioForm, setStudioForm] = useState<StudioForm>(() => defaultForm());
  const [provenanceId, setProvenanceId] = useState<string | null>(null);

  const [force, setForce] = useState<"" | Force>("");
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastState] = useState<string | null>(null);
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 760 : false,
  );

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const deepLinkDone = useRef(false);
  const toast = useCallback((msg: string) => {
    setToastState(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), 2400);
  }, []);

  // responsive flag
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // resolve session once
  useEffect(() => {
    authClient
      .getSession()
      .then((r) => {
        const data = (
          r as { data?: { user?: { id?: string; email?: string } } } | null
        )?.data;
        setSession(
          data?.user?.id
            ? { userId: data.user.id, email: data.user.email ?? "" }
            : null,
        );
      })
      .catch(() => setSession(null));
  }, []);

  const refreshCredits = useCallback(() => {
    fetchCredits()
      .then(setCreditBalance)
      .catch(() => {});
  }, []);

  // load collection + credits when signed in
  useEffect(() => {
    if (session && session !== "loading") {
      gallery()
        .then(setBadges)
        .catch(() => setBadges([]));
      refreshCredits();
    }
  }, [session, refreshCredits]);

  // deep-link: ?badge=<id> opens that badge's detail (share links). Runs once per page
  // load (a ref guard, not a length transition) and clears the param so a later
  // sign-out/sign-in can't force-navigate back to it.
  useEffect(() => {
    if (deepLinkDone.current || badges.length === 0) return;
    deepLinkDone.current = true;
    const id = new URLSearchParams(window.location.search).get("badge");
    if (id && badges.some((b) => b.id === id)) {
      setDetailId(id);
      setView("detail");
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [badges]);

  // poll generating badges every 2s until they settle. Keyed on the SET of generating ids
  // (a stable string) so a poll tick that only swaps a row's data doesn't tear down the
  // interval — it re-subscribes only when which badges are generating actually changes.
  const generatingKey = badges
    .filter((b) => b.status === "generating")
    .map((b) => b.id)
    .join(",");
  useEffect(() => {
    if (!generatingKey) return;
    const t = setInterval(() => {
      for (const id of generatingKey.split(",")) {
        one(id)
          .then((u) =>
            setBadges((prev) => prev.map((x) => (x.id === u.id ? u : x))),
          )
          .catch(() => {});
      }
    }, 2000);
    return () => clearInterval(t);
  }, [generatingKey]);

  // ── actions ────────────────────────────────────────────────────────────────
  const onNewBadge = useCallback(() => {
    setStudioMode("create");
    setStudioForm(defaultForm());
    setProvenanceId(null);
    setView("studio");
  }, []);

  const onTweak = useCallback((b: BadgeView) => {
    setStudioMode("tweak");
    setStudioForm(inputsToForm(b.inputs));
    setProvenanceId(b.id);
    setView("studio");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const onGenerate = useCallback(
    async (form: StudioForm) => {
      const inputs = formToInputs(form);
      if (inputs.raceName.trim().length === 0) {
        toast("Give your race a name first.");
        return;
      }
      if (typeof inputs.distance !== "string") {
        const { num, label } = inputs.distance;
        if (!label && num == null) {
          toast("Add a distance number or a custom label.");
          return;
        }
      }
      setBusy(true);
      const f = force || undefined;
      const res =
        studioMode === "tweak" && provenanceId
          ? await regenerate(provenanceId, { inputs, seed: null }, f)
          : await generate({ inputs, seed: null }, f);
      setBusy(false);
      if (!res.ok) {
        toast(res.reason);
        return;
      }
      setBadges((prev) => [res.badge, ...prev]);
      refreshCredits();
      setStudioMode("create");
      setProvenanceId(null);
      setView("collection");
      toast("Generating your emblem…");
    },
    [force, studioMode, provenanceId, refreshCredits, toast],
  );

  // Retry a FAILED badge IN PLACE: same row id, flips to generating — replace, never append.
  const onRetry = useCallback(
    async (b: BadgeView) => {
      const res = await retryBadge(b.id, force || undefined);
      if (!res.ok) {
        toast(res.reason);
        return;
      }
      setBadges((prev) =>
        prev.map((x) => (x.id === res.badge.id ? res.badge : x)),
      );
      refreshCredits();
      toast("Retrying generation…");
    },
    [force, refreshCredits, toast],
  );

  const onSetKeeper = useCallback(
    async (b: BadgeView) => {
      try {
        const refreshed = await setKeeperApi(b.id);
        setBadges(refreshed);
        toast("Keeper updated for this race");
      } catch {
        toast("Could not update keeper.");
      }
    },
    [toast],
  );

  const onDelete = useCallback(
    async (b: BadgeView) => {
      try {
        const refreshed = await removeBadge(b.id);
        setBadges(refreshed);
        if (detailId === b.id) {
          setDetailId(null);
          setView("collection");
        }
        toast("Badge deleted");
      } catch {
        toast("Could not delete that badge.");
      }
    },
    [detailId, toast],
  );

  const onShare = useCallback(
    (b: BadgeView) => {
      const link = `${window.location.origin}/?badge=${b.id}`;
      navigator.clipboard?.writeText(link).then(
        () => toast("Share link copied to clipboard"),
        () => toast(link),
      );
    },
    [toast],
  );

  const onOpenDetail = useCallback((b: BadgeView) => {
    setDetailId(b.id);
    setView("detail");
  }, []);

  const onBack = useCallback(() => setView("collection"), []);

  const onNav = useCallback(
    (v: View) => {
      if (v === "studio") onNewBadge();
      else setView(v);
    },
    [onNewBadge],
  );

  const collection = useMemo(() => buildCollection(badges), [badges]);
  const detailBadge = useMemo(
    () => badges.find((b) => b.id === detailId) ?? null,
    [badges, detailId],
  );
  const detailGroup = useMemo(
    () =>
      detailBadge
        ? (collection.races.find((r) =>
            r.badges.some((x) => x.id === detailBadge.id),
          ) ?? null)
        : null,
    [collection, detailBadge],
  );

  // ── render ───────────────────────────────────────────────────────────────────
  if (session === "loading") {
    return (
      <main style={center}>
        <span style={{ color: T.mutedInk }}>Loading…</span>
      </main>
    );
  }

  if (session === null) {
    return (
      <Landing
        email={email}
        onEmailChange={setEmail}
        sent={sent}
        onSubmit={() => {
          const e = email.trim();
          if (e) void sendMagicLink(e).then(() => setSent(true));
        }}
        mobile={mobile}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1180,
          background: "#ece6da",
          minHeight: "100vh",
          position: "relative",
        }}
      >
        <TopBar
          view={view}
          onNav={onNav}
          onNewBadge={onNewBadge}
          email={session.email}
          onSignOut={() => {
            void signOut().then(() => {
              setSession(null);
              setBadges([]);
              setSent(false);
              setView("collection");
            });
          }}
          isDemo={session.email.toLowerCase() === DEMO_EMAIL}
          force={force}
          onForce={setForce}
          mobile={mobile}
        />

        <main style={{ padding: mobile ? "20px 16px 90px" : "30px 36px 60px" }}>
          {view === "collection" && (
            <Collection
              badges={badges}
              mobile={mobile}
              onNewBadge={onNewBadge}
              onOpenDetail={onOpenDetail}
              onTweak={onTweak}
              onSetKeeper={onSetKeeper}
              onRetry={onRetry}
              onDelete={onDelete}
              onShare={onShare}
            />
          )}
          {view === "studio" && (
            <Studio
              initialForm={studioForm}
              mode={studioMode}
              credits={creditBalance ?? 0}
              busy={busy}
              mobile={mobile}
              onBack={onBack}
              onGenerate={onGenerate}
            />
          )}
          {view === "detail" && detailBadge && (
            <BadgeDetail
              badge={detailBadge}
              group={detailGroup}
              mobile={mobile}
              onBack={onBack}
              onTweak={onTweak}
              onSetKeeper={onSetKeeper}
              onDelete={onDelete}
              onShare={onShare}
              onRetry={onRetry}
            />
          )}
          {view === "detail" && !detailBadge && (
            <p style={{ color: T.mutedInk }}>
              That badge is no longer available.
            </p>
          )}
        </main>
      </div>

      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: T.ink,
            color: T.paper,
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 600,
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            zIndex: 100,
            animation: "tm-fadeup .25s ease both",
          }}
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}

// the centered backdrop for the brief 'loading' gate (the signed-out gate is its own screen,
// screens/Landing.tsx)
const center: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeContent: "center",
  background: T.bg,
  fontFamily: FONT_UI,
};
