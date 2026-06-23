// apps/web/src/screens/BadgeDetail.tsx — a single enlarged medal on a dark backdrop,
// with first-class share / download / order actions. Presentational: App owns the data
// + actions; this screen owns only ephemeral UI state (the ⋯ menu, a transient note for
// the placeholder share/order flows). Fields prefer the RaceGroup's resolved identity
// (consistent with the collection) and fall back to the badge's own inputs.
import { useEffect, useRef, useState } from "react";
import { Medal, exportBadgePng, copyBadgePng } from "../badge/Medal.js";
import { imageUrl } from "../api.js";
import { paletteSpec, resolveDistanceLabel, formatDate } from "../presets.js";
import { failLabel, safeName } from "../lib.js";
import { FONT_DISP, FONT_UI, T } from "../theme.js";
import type { BadgeDetailProps } from "../types.js";

const NOTE_MS = 2200;

// shared dark-surface button (top bar + share row): glassy on the radial backdrop.
const ghostBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(241,234,217,0.18)",
  color: "#e9e3d4",
  borderRadius: 9,
  padding: "9px 14px",
  fontFamily: FONT_UI,
  fontWeight: 600,
  fontSize: 13.5,
};

const shareBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(241,234,217,0.18)",
  color: "#e9e3d4",
  borderRadius: 10,
  padding: "11px 16px",
  fontFamily: FONT_UI,
  fontWeight: 600,
  fontSize: 13.5,
};

export function BadgeDetail({
  badge,
  group,
  mobile,
  onBack,
  onTweak,
  onSetKeeper,
  onDelete,
  onShare,
  onRetry,
}: BadgeDetailProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const svgWrapRef = useRef<HTMLDivElement | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // close the ⋯ menu on any outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const flashNote = (msg: string) => {
    setNote(msg);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  };

  // derive identity from the group when present, else from the badge's own inputs
  const raceName = badge.inputs.raceName;
  const distanceLabel =
    group?.distanceLabel ?? resolveDistanceLabel(badge.inputs.distance);
  const dateLabel = group?.dateLabel ?? formatDate(badge.inputs.date);
  const finishTime = badge.inputs.finishTime;
  const pal = paletteSpec(badge.inputs.palette);
  const ready = badge.status === "ready";
  const generating = badge.status === "generating";
  const failed = badge.status === "failed";
  const emblemUrl = ready ? imageUrl(badge.id) : null;

  const detailMedalW = mobile ? 250 : 360;

  const onDownload = () => {
    const svg = svgWrapRef.current?.querySelector("svg");
    if (svg)
      void exportBadgePng(
        svg as SVGSVGElement,
        safeName(raceName) + "-badge.png",
      );
  };

  const onCopyImage = () => {
    const svg = svgWrapRef.current?.querySelector("svg");
    if (!svg) return;
    void copyBadgePng(svg as SVGSVGElement).then(
      () => flashNote("Medal image copied to clipboard"),
      () => flashNote("Couldn’t copy the image — use Download instead"),
    );
  };

  return (
    <div
      style={{
        margin: mobile ? "-20px -16px -90px" : "-30px -36px -60px",
        padding: mobile ? "28px 18px 60px" : "46px 36px 70px",
        background:
          "radial-gradient(120% 80% at 50% 0%, #262b20 0%, #1a1e16 60%, #14170f 100%)",
        minHeight: "calc(100vh - 74px)",
      }}
    >
      {/* top bar */}
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <button type="button" style={ghostBtn} onClick={onBack}>
          ← Collection
        </button>

        {/* Tweak / delete only make sense once a badge exists as art; hide while generating */}
        {!generating && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              style={ghostBtn}
              onClick={() => onTweak(badge)}
            >
              ✎ Tweak
            </button>

            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                style={{
                  ...ghostBtn,
                  width: 40,
                  height: 40,
                  padding: 0,
                  justifyContent: "center",
                  color: "#cf9b86",
                  fontSize: 18,
                }}
                onClick={() => setMenuOpen((v) => !v)}
              >
                ⋯
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    minWidth: 168,
                    background: "#23271f",
                    border: "1px solid rgba(241,234,217,0.16)",
                    borderRadius: 10,
                    padding: 5,
                    boxShadow: "0 14px 34px rgba(0,0,0,0.45)",
                    zIndex: 20,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      color: "#e6a890",
                      fontFamily: FONT_UI,
                      fontWeight: 600,
                      fontSize: 13.5,
                      padding: "9px 11px",
                      borderRadius: 7,
                    }}
                    onClick={() => {
                      setMenuOpen(false);
                      if (
                        window.confirm(
                          `Delete this badge for "${raceName}"? This can't be undone.`,
                        )
                      ) {
                        onDelete(badge);
                      }
                    }}
                  >
                    Delete badge
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* GENERATING — skeleton, no medal frame, no actions (honest state) */}
      {generating && (
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            className="tm-shimmer"
            style={{
              width: detailMedalW,
              maxWidth: "86vw",
              aspectRatio: "1 / 1",
              borderRadius: "50%",
              border: "1px dashed rgba(241,234,217,0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <div
              className="tm-spin"
              style={{
                width: 30,
                height: 30,
                border: "3px solid rgba(241,234,217,0.35)",
                borderTopColor: "#e9e3d4",
                borderRadius: "50%",
              }}
            />
          </div>
          <h1
            style={{
              fontFamily: FONT_DISP,
              fontWeight: 700,
              fontSize: 28,
              color: "#f1ead9",
              margin: 0,
              textAlign: "center",
            }}
          >
            {raceName}
          </h1>
          <p
            style={{
              color: "#aab09c",
              fontFamily: FONT_UI,
              fontSize: 14,
              margin: 0,
            }}
          >
            Generating your emblem… this usually takes a few seconds.
          </p>
        </div>
      )}

      {/* FAILED — distinct muted/dashed treatment with the reason + Retry/Tweak */}
      {failed && (
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              width: detailMedalW,
              maxWidth: "86vw",
              aspectRatio: "1 / 1",
              borderRadius: "50%",
              background: "rgba(168,85,46,0.10)",
              border: "2px dashed #cf9b75",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <span style={{ color: "#e0a884", fontSize: 46 }}>⚠</span>
            <span
              style={{
                color: "#e0a884",
                fontFamily: FONT_UI,
                fontWeight: 600,
                fontSize: 14,
                textAlign: "center",
                padding: "0 16px",
              }}
            >
              {failLabel(badge)}
            </span>
          </div>
          <h1
            style={{
              fontFamily: FONT_DISP,
              fontWeight: 700,
              fontSize: 30,
              color: "#f1ead9",
              margin: 0,
              textAlign: "center",
              lineHeight: 1.05,
            }}
          >
            {raceName}
          </h1>
          <p
            style={{
              color: "#aab09c",
              fontFamily: FONT_UI,
              fontSize: 14,
              margin: 0,
              textAlign: "center",
              maxWidth: 360,
            }}
          >
            This generation didn't finish. Retry to fix this badge in place, or
            tweak the design and try again.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
            }}
          >
            {badge.errorTag !== "InvalidPrompt" && (
              <button
                type="button"
                onClick={() => onRetry(badge)}
                style={{
                  background: "#f1ead9",
                  color: "#1c2019",
                  border: "none",
                  borderRadius: 11,
                  padding: "13px 24px",
                  fontFamily: FONT_DISP,
                  fontWeight: 600,
                  fontSize: 17,
                  letterSpacing: 0.5,
                }}
              >
                ↻ Retry
              </button>
            )}
            <button
              type="button"
              style={{ ...ghostBtn, padding: "13px 24px", fontSize: 15 }}
              onClick={() => onTweak(badge)}
            >
              ✎ Tweak
            </button>
          </div>
        </div>
      )}

      {/* READY — the full medal + meta + actions */}
      {ready && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22,
            maxWidth: 760,
            margin: "0 auto",
          }}
        >
          {/* medal */}
          <div
            ref={svgWrapRef}
            style={{
              position: "relative",
              width: detailMedalW,
              maxWidth: "86vw",
            }}
          >
            {badge.keeper && (
              <span
                style={{
                  position: "absolute",
                  top: -13,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: T.brass,
                  color: "#1c2019",
                  fontFamily: FONT_UI,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  padding: "4px 12px",
                  borderRadius: 20,
                  boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
                  whiteSpace: "nowrap",
                  zIndex: 2,
                }}
              >
                ★ KEEPER
              </span>
            )}
            <Medal
              emblemUrl={emblemUrl}
              raceName={raceName}
              finishTime={finishTime}
              dateLabel={dateLabel}
              distanceLabel={distanceLabel}
              faceTone={pal.faceTone}
              accent={pal.accent}
            />
          </div>

          {/* meta */}
          <div style={{ textAlign: "center" }}>
            <h1
              style={{
                fontFamily: FONT_DISP,
                fontWeight: 700,
                fontSize: 34,
                color: "#f1ead9",
                margin: "0 0 10px",
                lineHeight: 1.05,
              }}
            >
              {raceName}
            </h1>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                flexDirection: mobile ? "column" : "row",
                gap: mobile ? 6 : 18,
                alignItems: "center",
                justifyContent: "center",
                color: "#aab09c",
                fontFamily: FONT_UI,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {distanceLabel && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    background: "rgba(201,161,74,0.16)",
                    color: "#dcbf7e",
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: 0.6,
                    padding: "4px 11px",
                    borderRadius: 20,
                    textTransform: "uppercase",
                  }}
                >
                  {distanceLabel}
                </span>
              )}
              {dateLabel && <span>{dateLabel}</span>}
              {finishTime && (
                <span>
                  Finish{" "}
                  <strong
                    style={{
                      fontFamily: FONT_DISP,
                      fontSize: 16,
                      color: "#f1ead9",
                    }}
                  >
                    {finishTime}
                  </strong>
                </span>
              )}
            </div>
          </div>

          {/* primary actions */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={onDownload}
              style={{
                background: "#f1ead9",
                color: "#1c2019",
                border: "none",
                borderRadius: 11,
                padding: "14px 26px",
                fontFamily: FONT_DISP,
                fontWeight: 600,
                fontSize: 18,
                letterSpacing: 0.5,
              }}
            >
              ↓ Download
            </button>
            <button
              type="button"
              onClick={onCopyImage}
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "#f1ead9",
                border: "1px solid rgba(241,234,217,0.20)",
                borderRadius: 11,
                padding: "14px 24px",
                fontFamily: FONT_DISP,
                fontWeight: 600,
                fontSize: 18,
                letterSpacing: 0.5,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              ⧉ Copy image
            </button>
          </div>

          {/* transient note for placeholder flows */}
          {note && (
            <p
              style={{
                margin: "-8px 0 0",
                color: "#c7cbb6",
                fontFamily: FONT_UI,
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {note}
            </p>
          )}

          {/* share row */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 11,
              marginTop: 2,
            }}
          >
            <span
              style={{
                fontFamily: FONT_UI,
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: "#787f6e",
                fontWeight: 700,
              }}
            >
              Share your finish
            </span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                style={shareBtn}
                onClick={() => onShare(badge)}
              >
                🔗 Copy link
              </button>
            </div>

            {!badge.keeper && (
              <button
                type="button"
                onClick={() => onSetKeeper(badge)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9aa18f",
                  fontFamily: FONT_UI,
                  fontSize: 13,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  padding: 0,
                  marginTop: 2,
                }}
              >
                ★ Set as this race keeper
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
