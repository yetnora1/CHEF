"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type KitchenSceneProps = {
  labels: { scene: string; pause: string; play: string };
};

/** A colour of the scene's palette (`--color-kitchen-*` in globals.css). */
const c = (name: string) => `var(--color-kitchen-${name})`;

// Parts that grow, pop or flicker from their own centre or base.
const fromCentre: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };
const fromBase: CSSProperties = { transformBox: "fill-box", transformOrigin: "50% 100%" };

/** A soft wisp of steam that rises, sways and fades; negative delays stagger the wisps. */
function Steam({ x, y, delay, scale = 1 }: { x: number; y: number; delay: string; scale?: number }) {
  const s = (value: number) => value * scale;
  return (
    <path
      d={`M${x} ${y} c${s(-9)} ${s(-11)} ${s(9)} ${s(-22)} 0 ${s(-33)} c${s(-9)} ${s(-11)} ${s(9)} ${s(-22)} 0 ${s(-33)}`}
      stroke="url(#k-wisp)"
      strokeWidth={s(7)}
      strokeLinecap="round"
      fill="none"
      className="animate-kitchen-steam"
      style={{ ...fromCentre, animationDelay: delay }}
    />
  );
}

/** A gas flame: blue at its base, warm at its tip. */
function Flame({ x, delay }: { x: number; delay: string }) {
  return (
    <path
      d={`M${x} 251 C${x - 6} 247 ${x - 4} 241 ${x} 235 C${x + 4} 241 ${x + 6} 247 ${x} 251 Z`}
      fill="url(#k-flame)"
      className="animate-kitchen-flame"
      style={{ ...fromBase, animationDelay: delay }}
    />
  );
}

// Injera's holes, spread over its oval along a golden-angle spiral.
const EYES = Array.from({ length: 24 }, (_, index) => {
  const angle = index * 2.39996;
  const radius = Math.sqrt((index + 0.5) / 24) * 0.84;
  return {
    cx: Math.round((960 + Math.cos(angle) * radius * 90) * 10) / 10,
    cy: Math.round((224 + Math.sin(angle) * radius * 11) * 10) / 10,
    delay: `${(-((index * 7) % 24) * 0.29).toFixed(2)}s`,
  };
});

const JARS = [
  { x: 70, fill: "berbere" },
  { x: 134, fill: "lentil" },
  { x: 198, fill: "turmeric" },
  { x: 262, fill: "teff" },
] as const;

const TOQUE_CROWN =
  "M508 56 C496 50 494 33 505 25 C511 15 527 12 537 16 C547 10 565 12 571 22 C583 28 585 46 573 54 C553 48 526 48 508 56 Z";
const POT_BODY =
  "M636 178 C636 207 637 230 642 240 C646 246 656 248 668 248 L764 248 C776 248 786 246 790 240 C795 230 796 207 796 178 A80 12 0 0 1 636 178 Z";

/**
 * A painted kitchen under the homepage header: a chef in a white coat and
 * toque stirs a steel pot of stew over gas flames; beside it injera cooks on a
 * clay mitad as its holes open, a jebena keeps coffee warm, and a red onion and
 * a knife wait on a board next to a bowl of berbere. Flat shapes with crisp
 * shadow shapes and a few soft gradients, no outlines, in the fixed
 * `--color-kitchen-*` palette, lit from the window on the right. It only moves
 * and fades (CSS keyframes, no library). On narrow screens the sides are
 * cropped and the chef and the pot stay in the middle. It pauses off screen
 * and with its button (moving content needs a way to stop it), and stands
 * still for visitors who ask for reduced motion.
 */
export function KitchenScene({ labels }: KitchenSceneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-paused={!playing || !visible ? "" : undefined}
      className="relative overflow-hidden rounded-3xl border border-border shadow-glass data-paused:**:[animation-play-state:paused]"
    >
      <svg
        viewBox="0 -20 1200 340"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={labels.scene}
        className="block h-[220px] w-full sm:h-[260px] lg:h-[300px]"
      >
        <defs>
          <linearGradient id="k-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c("wall-top")} />
            <stop offset="1" stopColor={c("wall-bottom")} />
          </linearGradient>
          <radialGradient id="k-window-light" cx="1060" cy="60" r="620" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={c("light")} stopOpacity="0.9" />
            <stop offset="1" stopColor={c("light")} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="k-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c("sky-top")} />
            <stop offset="1" stopColor={c("sky-bottom")} />
          </linearGradient>
          <pattern id="k-tiles" width="56" height="28" patternUnits="userSpaceOnUse">
            <rect width="56" height="28" fill={c("tile")} />
            <path
              d="M0 0.5H56 M0 14.5H56 M28.5 0.5V14.5 M0.5 14.5V28"
              stroke={c("tile-line")}
              strokeWidth="1.2"
            />
          </pattern>
          <linearGradient id="k-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c("wood-light")} />
            <stop offset="1" stopColor={c("wood")} />
          </linearGradient>
          <linearGradient id="k-counter-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c("wood-dark")} />
            <stop offset="1" stopColor={c("wood-deep")} />
          </linearGradient>
          <linearGradient id="k-steel" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={c("steel-dark")} />
            <stop offset="0.18" stopColor={c("steel")} />
            <stop offset="0.42" stopColor={c("steel-light")} />
            <stop offset="0.62" stopColor={c("steel-shine")} />
            <stop offset="0.72" stopColor={c("steel-light")} />
            <stop offset="0.9" stopColor={c("steel")} />
            <stop offset="1" stopColor={c("steel-dark")} />
          </linearGradient>
          <linearGradient id="k-steel-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.4" stopColor={c("shadow")} stopOpacity="0" />
            <stop offset="1" stopColor={c("shadow")} stopOpacity="0.28" />
          </linearGradient>
          <radialGradient id="k-stew" cx="0.62" cy="0.3" r="0.75">
            <stop offset="0" stopColor={c("stew-light")} />
            <stop offset="0.55" stopColor={c("stew")} />
            <stop offset="1" stopColor={c("stew-dark")} />
          </radialGradient>
          <linearGradient id="k-flame" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={c("flame-blue")} />
            <stop offset="0.6" stopColor={c("flame-sky")} />
            <stop offset="1" stopColor={c("flame-orange")} />
          </linearGradient>
          <radialGradient id="k-glow">
            <stop offset="0" stopColor={c("glow")} stopOpacity="0.55" />
            <stop offset="1" stopColor={c("glow")} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="k-wisp" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={c("steam")} stopOpacity="0" />
            <stop offset="0.35" stopColor={c("steam")} stopOpacity="0.9" />
            <stop offset="1" stopColor={c("steam")} stopOpacity="0" />
          </linearGradient>
          <radialGradient id="k-shadow">
            <stop offset="0" stopColor={c("shadow")} stopOpacity="0.3" />
            <stop offset="1" stopColor={c("shadow")} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="k-stove-shade">
            <stop offset="0" stopColor={c("shadow")} stopOpacity="0.12" />
            <stop offset="1" stopColor={c("shadow")} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="k-injera" cx="0.55" cy="0.4" r="0.6">
            <stop offset="0" stopColor={c("injera-light")} />
            <stop offset="1" stopColor={c("injera")} />
          </radialGradient>
          <linearGradient id="k-clay" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c("clay")} />
            <stop offset="1" stopColor={c("clay-dark")} />
          </linearGradient>
          <radialGradient id="k-onion" cx="0.66" cy="0.32" r="0.75">
            <stop offset="0" stopColor={c("onion-light")} />
            <stop offset="0.6" stopColor={c("onion")} />
            <stop offset="1" stopColor={c("onion-dark")} />
          </radialGradient>
          <radialGradient id="k-berbere" cx="0.6" cy="0.3" r="0.8">
            <stop offset="0" stopColor={c("berbere")} />
            <stop offset="1" stopColor={c("berbere-dark")} />
          </radialGradient>
          <radialGradient id="k-jebena" cx="0.7" cy="0.32" r="0.75">
            <stop offset="0" stopColor={c("jebena-light")} />
            <stop offset="1" stopColor={c("jebena")} />
          </radialGradient>
          <linearGradient id="k-blade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c("steel-shine")} />
            <stop offset="1" stopColor={c("steel")} />
          </linearGradient>
        </defs>

        {/* The room: a warm wall, quiet tiles, a window on the right, a shelf of spices */}
        <rect y="-20" width="1200" height="340" fill="url(#k-wall)" />
        <rect y="150" width="1200" height="88" fill="url(#k-tiles)" opacity="0.55" />
        <rect y="-20" width="1200" height="340" fill="url(#k-window-light)" />
        <ellipse cx="716" cy="160" rx="210" ry="120" fill="url(#k-stove-shade)" />

        <rect x="996" y="22" width="160" height="108" rx="6" fill={c("wood-dark")} />
        <rect x="1004" y="30" width="144" height="92" rx="3" fill="url(#k-sky)" />
        <path d="M1076 30 V122 M1004 76 H1148" stroke={c("wood-dark")} strokeWidth="5" />
        <path d="M1010 36 H1046 L1010 66 Z" fill={c("steam")} opacity="0.4" />
        <rect x="988" y="128" width="176" height="8" rx="3" fill={c("wood")} />

        <rect x="56" y="104" width="282" height="7" rx="3" fill={c("wood")} />
        <rect x="60" y="111" width="274" height="5" rx="2" fill={c("shadow")} opacity="0.1" />
        {JARS.map(({ x, fill }) => (
          <g key={x}>
            <rect x={x} y="56" width="44" height="48" rx="9" fill={c("steam")} opacity="0.45" />
            <rect x={x + 5} y="72" width="34" height="28" rx="6" fill={c(fill)} />
            <rect x={x - 2} y="48" width="48" height="10" rx="4" fill={c("wood-dark")} />
            <rect x={x + 34} y="62" width="3" height="34" rx="1.5" fill={c("steam")} opacity="0.75" />
          </g>
        ))}

        {/* The chef, behind the counter: breathing, head following the stirring */}
        <g className="animate-kitchen-breathe">
          <path
            d="M470 240 C466 214 466 186 474 164 C482 146 498 136 516 132 L548 130 C566 134 580 146 586 164 C592 186 594 214 592 240 Z"
            fill={c("coat-light")}
          />
          <path
            d="M470 240 C466 214 466 186 474 164 C480 152 490 143 502 137 C494 160 490 198 492 240 Z"
            fill={c("coat-shade")}
            opacity="0.45"
          />
          <path
            d="M471 208 C506 203 556 203 591 208 L592 240 L470 240 C470 228 470 218 471 208 Z"
            fill={c("apron")}
          />
          <path
            d="M471 208 C506 203 556 203 591 208 L591 212 C556 207 506 207 471 212 Z"
            fill={c("apron-light")}
          />
          <path
            d="M569 140 C571 162 573 186 574 205"
            stroke={c("coat-shade")}
            strokeWidth="1.6"
            fill="none"
          />
          {[156, 175, 194].map((y) => (
            <g key={y} fill={c("coat-shade")}>
              <circle cx="560" cy={y} r="2.8" />
              <circle cx="582" cy={y} r="2.8" />
            </g>
          ))}

          <g className="animate-kitchen-nod" style={{ transformOrigin: "534px 132px" }}>
            <path
              d="M522 108 L546 106 C547 116 548 124 550 132 L520 134 C522 124 522 116 522 108 Z"
              fill={c("skin")}
            />
            <path
              d="M522 108 L546 106 L547 115 C538 118 528 118 522 115 Z"
              fill={c("skin-dark")}
              opacity="0.55"
            />
            <path
              d="M516 66 C524 56 544 54 556 62 C563 67 566 74 567 81 L571 89 C573 91 572 93 569 93 L568 96 C569 98 568 100 565 100 L564 103 C563 108 559 111 553 112 C544 113 532 111 524 106 C516 101 512 92 512 82 C512 76 513 70 516 66 Z"
              fill={c("skin")}
            />
            <path
              d="M516 66 C512 72 512 86 516 96 C520 86 524 74 532 64 Z"
              fill={c("skin-dark")}
              opacity="0.45"
            />
            <path d="M515 67 C512 72 512 80 514 86 C518 79 522 72 527 66 Z" fill={c("hair")} />
            <ellipse cx="530" cy="84" rx="4" ry="6" fill={c("skin-dark")} opacity="0.8" />
            <path
              d="M555 73 C558 71 562 71 565 73"
              stroke={c("hair")}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M557 79 C559 81 562 81 564 79.5"
              stroke={c("hair")}
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />

            {/* Toque: a pleated crown over a band, shaded on the side away from the window */}
            <path d={TOQUE_CROWN} fill={c("coat-light")} />
            <path
              d="M508 56 C496 50 494 33 505 25 C503 36 506 47 515 54 Z"
              fill={c("coat-shade")}
              opacity="0.7"
            />
            <path
              d="M526 48 C523 38 525 26 531 17 M548 48 C549 38 548 26 544 15"
              stroke={c("coat-shade")}
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              opacity="0.7"
            />
            <path d="M510 68 C524 61 552 59 572 65 L571 52 C552 46 524 47 510 56 Z" fill={c("coat-light")} />
            <path d="M510 68 C524 61 552 59 572 65" stroke={c("coat-shade")} strokeWidth="1.4" fill="none" />
          </g>

          {/* Collar and neckerchief */}
          <path
            d="M514 134 C526 126 546 124 556 130 L555 139 C544 134 528 135 517 141 Z"
            fill={c("coat-light")}
          />
          <path d="M550 132 C556 129 562 132 563 138 C559 142 553 142 550 138 Z" fill={c("scarf")} />
          <path d="M556 140 L561 153 L553 149 Z" fill={c("scarf-dark")} />

          {/* Upper arm, reaching towards the pot */}
          <path
            d="M568 146 C576 136 592 138 598 150 L612 182 C615 192 607 199 598 197 C592 196 588 192 586 187 L572 162 C569 156 567 151 568 146 Z"
            fill={c("coat-light")}
          />
          <path
            d="M586 187 L572 162 C570 158 569 154 569 150 C576 164 588 180 602 194 C597 197 591 193 586 187 Z"
            fill={c("coat-shade")}
            opacity="0.5"
          />
        </g>

        {/* Counter */}
        <rect y="238" width="1200" height="14" fill="url(#k-wood)" />
        <rect y="251" width="1200" height="1.5" fill={c("wood-light")} />
        <rect y="252" width="1200" height="68" fill="url(#k-counter-front)" />

        {/* A white bowl of berbere */}
        <ellipse cx="104" cy="250" rx="40" ry="5" fill="url(#k-shadow)" />
        <path d="M80 216 C86 203 96 199 104 199 C112 199 122 203 128 216 Z" fill="url(#k-berbere)" />
        <path d="M72 215 C76 233 88 244 104 244 C120 244 132 233 136 215 Z" fill={c("coat-light")} />
        <path
          d="M72 215 C76 233 88 244 104 244 C94 238 84 228 80 215 Z"
          fill={c("coat-shade")}
          opacity="0.7"
        />

        {/* Cutting board with a red onion, a cut half and a knife */}
        <ellipse cx="282" cy="250" rx="126" ry="6" fill="url(#k-shadow)" />
        <path d="M176 228 H384 Q392 228 392 234 V238 H168 V234 Q168 228 176 228 Z" fill={c("wood-light")} />
        <rect x="168" y="238" width="224" height="7" rx="2" fill={c("wood")} />
        <circle cx="212" cy="210" r="19" fill="url(#k-onion)" />
        <ellipse cx="218" cy="202" rx="5.5" ry="3.5" fill={c("steam")} opacity="0.35" />
        <path
          d="M212 191 C211 186 213 182 216 180"
          stroke={c("onion-dark")}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M240 228 C240 211 284 211 284 228 Z" fill="url(#k-onion)" />
        <ellipse cx="262" cy="226" rx="22" ry="7" fill={c("onion-flesh")} />
        {[15, 10, 5].map((rx) => (
          <ellipse
            key={rx}
            cx="262"
            cy="226"
            rx={rx}
            ry={rx * 0.32}
            fill="none"
            stroke={c("onion-light")}
            strokeWidth="1.1"
            opacity="0.75"
          />
        ))}
        <path d="M304 233 L364 225 L367 229 L307 235 Z" fill="url(#k-blade)" />
        <rect
          x="364"
          y="223"
          width="34"
          height="8"
          rx="3"
          transform="rotate(-7 364 223)"
          fill={c("jebena")}
        />

        {/* Pot of stew on a gas ring */}
        <ellipse cx="706" cy="252" rx="100" ry="7" fill="url(#k-shadow)" />
        <ellipse cx="716" cy="248" rx="96" ry="12" fill="url(#k-glow)" className="animate-kitchen-glow" />
        <rect x="642" y="245" width="148" height="4" rx="2" fill={c("iron")} />
        <ellipse cx="716" cy="178" rx="80" ry="12" fill="url(#k-steel)" />
        <ellipse cx="716" cy="179" rx="74" ry="10" fill={c("pot-inside")} />

        {/* The stirring forearm, hand and wooden spoon */}
        <g className="animate-kitchen-stir" style={{ transformOrigin: "602px 190px" }}>
          <path
            d="M594 188 C594 178 604 172 614 174 L652 156 C660 153 667 159 665 167 C664 171 661 173 657 175 L618 198 C608 204 594 198 594 190 Z"
            fill={c("coat-light")}
          />
          <path
            d="M600 196 C612 194 634 182 662 168 L657 175 L618 198 C611 202 604 201 600 196 Z"
            fill={c("coat-shade")}
            opacity="0.5"
          />
          <path d="M646 158 C652 162 657 168 659 175 L652 178 C650 171 646 166 640 161 Z" fill={c("coat")} />
          <path
            d="M654 162 C660 154 670 150 679 151 C687 152 692 158 690 165 C688 172 679 176 670 175 C662 174 655 170 654 162 Z"
            fill={c("skin")}
          />
          <path d="M652 128 L710 197" stroke={c("wood-dark")} strokeWidth="6.5" strokeLinecap="round" />
          <path d="M651 127 L707 194" stroke={c("wood-light")} strokeWidth="2" strokeLinecap="round" />
          <path
            d="M671 154 C677 152 684 152 688 156 C690 160 689 165 686 168 C682 166 676 163 671 160 Z"
            fill={c("skin")}
          />
          <path
            d="M673 156 C678 158 683 161 687 164 M674 161 C679 163 683 165 686 168"
            stroke={c("skin-dark")}
            strokeWidth="1.1"
            strokeLinecap="round"
            fill="none"
            opacity="0.7"
          />
          <path d="M660 157 C664 150 672 147 679 149 C675 152 670 155 666 160 Z" fill={c("skin-light")} />
        </g>

        <ellipse cx="716" cy="181" rx="71" ry="8.5" fill="url(#k-stew)" />
        <path
          d="M730 178 C742 176 754 177 764 180"
          stroke={c("oil")}
          strokeWidth="1.6"
          fill="none"
          opacity="0.5"
          strokeLinecap="round"
        />
        <ellipse
          cx="701"
          cy="184"
          rx="11"
          ry="2.8"
          fill="none"
          stroke={c("stew-light")}
          strokeWidth="1.2"
          className="animate-kitchen-ripple"
          style={fromCentre}
        />
        {[
          { cx: 742, cy: 182, r: 2.4, delay: "-0.4s" },
          { cx: 758, cy: 184, r: 1.9, delay: "-1.3s" },
          { cx: 684, cy: 183, r: 2, delay: "-1.8s" },
        ].map(({ cx, cy, r, delay }) => (
          <circle
            key={cx}
            cx={cx}
            cy={cy}
            r={r}
            fill={c("oil")}
            className="animate-kitchen-bubble"
            style={{ ...fromCentre, animationDelay: delay }}
          />
        ))}
        <path d={POT_BODY} fill="url(#k-steel)" />
        <path d={POT_BODY} fill="url(#k-steel-shade)" />
        <path
          d="M636 178 A80 12 0 0 0 796 178"
          stroke={c("steel-shine")}
          strokeWidth="1.6"
          fill="none"
          opacity="0.9"
        />
        <path
          d="M751 194 C753 208 753 226 750 240"
          stroke={c("steel-shine")}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M636 192 C622 190 616 198 622 206 C626 210 632 208 637 206"
          stroke={c("steel")}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M796 192 C810 190 816 198 810 206 C806 210 800 208 795 206"
          stroke={c("steel-light")}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        {[656, 676, 696, 716, 736, 756, 776].map((x, index) => (
          <Flame key={x} x={x} delay={`${-(index % 3) * 0.17}s`} />
        ))}

        {/* Injera on a clay mitad, its holes opening as it cooks */}
        <ellipse cx="954" cy="252" rx="114" ry="6" fill="url(#k-shadow)" />
        <path d="M876 238 H1044 V248 Q1044 251 1040 251 H880 Q876 251 876 248 Z" fill={c("clay-dark")} />
        <ellipse
          cx="960"
          cy="240"
          rx="94"
          ry="8"
          fill="url(#k-glow)"
          className="animate-kitchen-glow"
          style={{ animationDelay: "-0.6s" }}
        />
        <ellipse cx="960" cy="232" rx="108" ry="15" fill={c("clay-dark")} />
        <ellipse cx="960" cy="227" rx="108" ry="15" fill="url(#k-clay)" />
        <ellipse cx="960" cy="225" rx="93" ry="12" fill="url(#k-injera)" />
        {EYES.map(({ cx, cy, delay }) => (
          <ellipse
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            rx="2.3"
            ry="1.1"
            fill={c("injera-eye")}
            className="animate-kitchen-eye"
            style={{ ...fromCentre, animationDelay: delay }}
          />
        ))}

        {/* A jebena of coffee */}
        <ellipse cx="1112" cy="252" rx="40" ry="5" fill="url(#k-shadow)" />
        <path
          d="M1098 154 C1076 156 1074 192 1090 204"
          stroke={c("jebena")}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M1128 212 L1150 180 L1155 183 L1136 218 Z" fill="url(#k-jebena)" />
        <circle cx="1114" cy="220" r="27" fill="url(#k-jebena)" />
        <path d="M1104 197 L1108 150 H1120 L1124 197 Z" fill="url(#k-jebena)" />
        <ellipse cx="1114" cy="150" rx="9" ry="3" fill={c("jebena-light")} />
        <path d="M1108 147 C1110 137 1118 137 1120 147" fill={c("straw")} />
        <path
          d="M1124 206 C1128 214 1128 226 1124 234"
          stroke={c("steam")}
          strokeWidth="2.5"
          fill="none"
          opacity="0.22"
          strokeLinecap="round"
        />

        {/* Steam */}
        <Steam x={706} y={160} delay="-0.4s" />
        <Steam x={732} y={162} delay="-1.9s" />
        <Steam x={758} y={160} delay="-3.2s" scale={0.85} />
        <Steam x={936} y={212} delay="-1.1s" scale={0.7} />
        <Steam x={986} y={212} delay="-2.8s" scale={0.7} />
        <Steam x={1152} y={176} delay="-2.2s" scale={0.5} />
      </svg>

      <button
        type="button"
        onClick={() => setPlaying((value) => !value)}
        aria-label={playing ? labels.pause : labels.play}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "absolute right-3 bottom-3 size-9 border-stage-foreground/25 bg-stage/45 text-stage-foreground hover:bg-stage/60 motion-reduce:hidden",
        )}
      >
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </button>
    </div>
  );
}
