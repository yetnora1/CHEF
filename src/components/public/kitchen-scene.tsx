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

/** A soft cloud of steam that rises, widens and fades; negative delays stagger it. */
function Steam({ x, y, delay, size = 1 }: { x: number; y: number; delay: string; size?: number }) {
  return (
    <g className="animate-kitchen-steam" style={{ ...fromCentre, animationDelay: delay }}>
      <ellipse cx={x} cy={y} rx={14 * size} ry={18 * size} fill="url(#k-steam)" />
      <ellipse cx={x + 9 * size} cy={y - 14 * size} rx={12 * size} ry={15 * size} fill="url(#k-steam)" />
      <ellipse cx={x - 5 * size} cy={y - 27 * size} rx={10 * size} ry={13 * size} fill="url(#k-steam)" />
    </g>
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
const EYES = Array.from({ length: 28 }, (_, index) => {
  const angle = index * 2.39996;
  const radius = Math.sqrt((index + 0.5) / 28) * 0.86;
  return {
    cx: Math.round((940 + Math.cos(angle) * radius * 94) * 10) / 10,
    cy: Math.round((224 + Math.sin(angle) * radius * 11.5) * 10) / 10,
    delay: `${(-((index * 11) % 28) * 0.25).toFixed(2)}s`,
  };
});

const JARS = [
  { x: 62, fill: "berbere" },
  { x: 126, fill: "lentil" },
  { x: 190, fill: "turmeric" },
  { x: 254, fill: "teff" },
] as const;

/**
 * A painted kitchen under the homepage header: a chef in a white coat and
 * toque stirs a steel pot of stew over gas flames, injera cooks on a clay mitad
 * (its holes opening), with red onions, chillies and a knife on a wooden board,
 * a bowl of berbere, and a jebena of coffee, in a tiled kitchen lit by a window
 * on the right. Inline SVG shaded with gradients and soft shadows (no outlines)
 * in the fixed `--color-kitchen-*` palette; it only moves and fades (CSS
 * keyframes, no library). On narrow screens the sides are cropped and the chef
 * and the pot stay in the middle. It pauses off screen and with its button
 * (moving content needs a way to stop it), and stands still for visitors who
 * ask for reduced motion.
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
          <radialGradient id="k-window-light" cx="1070" cy="40" r="560" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={c("light")} stopOpacity="0.85" />
            <stop offset="1" stopColor={c("light")} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="k-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c("sky-top")} />
            <stop offset="1" stopColor={c("sky-bottom")} />
          </linearGradient>
          <pattern id="k-tiles" width="48" height="24" patternUnits="userSpaceOnUse">
            <rect width="48" height="24" fill={c("tile")} />
            <path
              d="M0 0.5H48 M0 12.5H48 M24.5 0.5V12.5 M0.5 12.5V24"
              stroke={c("tile-line")}
              strokeWidth="1.2"
              opacity="0.8"
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
          <linearGradient id="k-coat" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={c("coat-shade")} />
            <stop offset="0.45" stopColor={c("coat")} />
            <stop offset="1" stopColor={c("coat-light")} />
          </linearGradient>
          <linearGradient id="k-sleeve" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={c("coat")} />
            <stop offset="0.5" stopColor={c("coat-light")} />
            <stop offset="1" stopColor={c("coat-shade")} />
          </linearGradient>
          <linearGradient id="k-skin" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={c("skin-dark")} />
            <stop offset="0.55" stopColor={c("skin")} />
            <stop offset="1" stopColor={c("skin-light")} />
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
            <stop offset="0.35" stopColor={c("shadow")} stopOpacity="0" />
            <stop offset="1" stopColor={c("shadow")} stopOpacity="0.3" />
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
            <stop offset="0" stopColor={c("glow")} stopOpacity="0.6" />
            <stop offset="1" stopColor={c("glow")} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="k-steam">
            <stop offset="0" stopColor={c("steam")} stopOpacity="0.9" />
            <stop offset="0.55" stopColor={c("steam")} stopOpacity="0.38" />
            <stop offset="1" stopColor={c("steam")} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="k-stove-shade">
            <stop offset="0" stopColor={c("shadow")} stopOpacity="0.16" />
            <stop offset="1" stopColor={c("shadow")} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="k-shadow">
            <stop offset="0" stopColor={c("shadow")} stopOpacity="0.35" />
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
          <linearGradient id="k-chili" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c("chili-light")} />
            <stop offset="1" stopColor={c("chili")} />
          </linearGradient>
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
            <stop offset="0.6" stopColor={c("steel-light")} />
            <stop offset="1" stopColor={c("steel")} />
          </linearGradient>
        </defs>

        {/* The room: a warm wall, tiles behind the counter, a window on the right, a spice shelf */}
        <rect y="-20" width="1200" height="340" fill="url(#k-wall)" />
        <rect y="140" width="1200" height="96" fill="url(#k-tiles)" />
        <rect y="-20" width="1200" height="340" fill="url(#k-window-light)" />
        <ellipse cx="700" cy="150" rx="200" ry="125" fill="url(#k-stove-shade)" />
        <rect x="990" y="26" width="164" height="104" rx="4" fill={c("wood-dark")} />
        <rect x="998" y="34" width="148" height="88" rx="2" fill="url(#k-sky)" />
        <path d="M1070 34 V122 M998 78 H1146" stroke={c("wood-dark")} strokeWidth="5" />
        <path d="M1004 40 L1040 40 L1004 70 Z" fill={c("steam")} opacity="0.35" />
        <rect x="982" y="128" width="180" height="8" rx="2" fill={c("wood")} />

        <rect x="44" y="98" width="290" height="7" rx="2" fill={c("wood")} />
        <rect x="44" y="105" width="290" height="6" fill={c("shadow")} opacity="0.12" />
        {JARS.map(({ x, fill }) => (
          <g key={x}>
            <rect x={x} y="50" width="44" height="48" rx="7" fill={c("steam")} opacity="0.4" />
            <rect x={x + 4} y="66" width="36" height="29" rx="5" fill={c(fill)} />
            <rect x={x - 2} y="43" width="48" height="9" rx="3" fill={c("wood-dark")} />
            <rect x={x + 34} y="56" width="3" height="36" rx="1.5" fill={c("steam")} opacity="0.7" />
          </g>
        ))}

        {/* The chef, behind the counter: breathing, head moving with the stirring */}
        <g className="animate-kitchen-breathe">
          <path
            d="M452 146 C438 156 432 186 434 214 C435 226 440 236 450 238 L462 238 C458 210 458 176 462 150 Z"
            fill={c("coat-shade")}
          />
          <path
            d="M444 238 C440 200 438 168 446 146 C452 132 466 124 484 121 L540 119 C560 120 574 128 580 142 C586 160 588 200 590 238 Z"
            fill="url(#k-coat)"
          />
          <path
            d="M500 140 C520 136 552 140 570 150 C556 146 524 144 504 148 Z"
            fill={c("coat-light")}
            opacity="0.8"
          />
          <path
            d="M566 132 C572 146 576 160 578 176"
            stroke={c("coat-shade")}
            strokeWidth="1.6"
            fill="none"
          />
          <path
            d="M444 238 C440 200 438 168 446 146 C450 138 458 131 470 126 C462 152 462 192 466 238 Z"
            fill={c("shadow")}
            opacity="0.12"
          />
          <path
            d="M542 132 C544 162 546 200 548 238"
            stroke={c("coat-shade")}
            strokeWidth="1.6"
            fill="none"
          />
          {[150, 174, 198, 222].map((y) => (
            <g key={y}>
              <circle cx="530" cy={y} r="3.4" fill={c("coat-shade")} />
              <circle cx="530.8" cy={y - 0.8} r="2.4" fill={c("coat")} />
              <circle cx="556" cy={y} r="3.4" fill={c("coat-shade")} />
              <circle cx="556.8" cy={y - 0.8} r="2.4" fill={c("coat")} />
            </g>
          ))}
          <path
            d="M470 180 C478 190 488 194 500 194"
            stroke={c("coat-shade")}
            strokeWidth="1.4"
            fill="none"
            opacity="0.8"
          />
          <path
            d="M478 214 C490 220 504 222 516 220"
            stroke={c("coat-shade")}
            strokeWidth="1.4"
            fill="none"
            opacity="0.6"
          />

          <g className="animate-kitchen-nod" style={{ transformOrigin: "516px 120px" }}>
            <path d="M500 98 L528 96 L534 124 L500 126 Z" fill={c("skin")} />
            <path d="M502 112 L530 108 L533 122 L502 125 Z" fill={c("shadow")} opacity="0.2" />
            <path
              d="M498 60 C506 50 526 47 540 54 C549 59 553 67 554 74 L559 82 C561 84 560 86 557 86 L556 89 C557 91 556 93 553 93 L552 96 C551 101 547 104 541 105 C530 107 518 105 509 100 C500 95 495 86 494 76 C494 70 495 64 498 60 Z"
              fill="url(#k-skin)"
            />
            <path d="M497 62 C494 70 495 78 499 84 C502 77 505 70 509 63 Z" fill={c("hair")} />
            <ellipse cx="512" cy="77" rx="5" ry="7.5" fill={c("skin-dark")} />
            <path d="M510 73 C513 75 513 80 510 82" stroke={c("skin")} strokeWidth="1.4" fill="none" />
            <path
              d="M541 66 C544 64 548 64 551 66"
              stroke={c("hair")}
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M543 72 C545 74 548 74 550 72.5"
              stroke={c("hair")}
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
            <path d="M552 89.5 L556 89.5" stroke={c("skin-dark")} strokeWidth="1.3" strokeLinecap="round" />
            <path
              d="M554 76 C556 79 558 81 559 82"
              stroke={c("skin-light")}
              strokeWidth="1.2"
              fill="none"
              opacity="0.8"
            />

            {/* Toque: a band and a pleated, puffed crown */}
            <path
              d="M490 50 C478 44 476 26 488 18 C494 8 510 6 520 10 C530 4 548 6 554 16 C566 22 568 40 556 48 C536 42 508 42 490 50 Z"
              fill="url(#k-coat)"
            />
            <path
              d="M506 45 C504 34 505 22 510 13 M524 43 C523 32 524 20 528 9 M542 45 C543 35 543 24 541 14"
              stroke={c("coat-shade")}
              strokeWidth="1.6"
              fill="none"
            />
            <path d="M492 62 C506 54 536 52 556 58 L555 46 C536 40 506 41 492 50 Z" fill="url(#k-coat)" />
            <path d="M492 62 C506 54 536 52 556 58" stroke={c("coat-shade")} strokeWidth="1.4" fill="none" />
          </g>

          {/* Collar and neckerchief */}
          <path
            d="M500 122 C508 115 530 113 540 119 L538 129 C528 124 512 125 503 131 Z"
            fill={c("coat-light")}
          />
          <path d="M528 121 C536 118 546 121 548 128 C544 134 536 136 530 132 Z" fill={c("scarf")} />
          <path d="M538 130 L544 146 L534 142 Z" fill={c("scarf-dark")} />

          {/* Upper arm, reaching towards the pot */}
          <path
            d="M560 136 C574 128 590 134 596 150 L604 182 C606 192 598 198 590 196 C584 194 581 190 580 184 L566 158 C562 150 558 142 560 136 Z"
            fill="url(#k-sleeve)"
          />
        </g>

        {/* Counter: a wooden top and front */}
        <rect y="236" width="1200" height="14" fill="url(#k-wood)" />
        <rect y="249" width="1200" height="1.5" fill={c("wood-light")} />
        <rect y="250" width="1200" height="70" fill="url(#k-counter-front)" />
        <path
          d="M0 268 C200 264 420 272 640 266 C860 260 1020 270 1200 265 M0 296 C260 292 520 300 760 294 C980 289 1100 298 1200 294"
          stroke={c("wood-deep")}
          strokeWidth="1.5"
          fill="none"
          opacity="0.6"
        />

        {/* A bowl of berbere */}
        <ellipse cx="96" cy="247" rx="40" ry="5" fill="url(#k-shadow)" />
        <path d="M66 214 C70 232 82 244 98 244 C114 244 126 232 130 214 Z" fill="url(#k-clay)" />
        <path d="M70 216 C76 200 90 194 98 194 C108 194 120 200 126 216 Z" fill="url(#k-berbere)" />
        <ellipse cx="98" cy="215" rx="32" ry="4" fill={c("clay")} />
        {[
          [86, 205],
          [104, 200],
          [112, 208],
          [94, 211],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill={c("berbere-dark")} />
        ))}

        {/* Cutting board: a red onion, a cut half, chopped onion, chillies, garlic and a knife */}
        <ellipse cx="272" cy="247" rx="138" ry="6" fill="url(#k-shadow)" />
        <path d="M156 226 H396 Q404 226 404 232 V236 H148 V232 Q148 226 156 226 Z" fill={c("wood-light")} />
        <rect x="148" y="236" width="256" height="7" rx="2" fill={c("wood")} />
        <path
          d="M170 231 C220 229 300 233 380 230"
          stroke={c("wood")}
          strokeWidth="1"
          fill="none"
          opacity="0.6"
        />

        <circle cx="196" cy="206" r="20" fill="url(#k-onion)" />
        <ellipse cx="202" cy="198" rx="6" ry="4" fill={c("steam")} opacity="0.35" />
        <path
          d="M196 186 C195 180 198 176 201 174"
          stroke={c("onion-dark")}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M190 225 C194 228 198 228 202 225"
          stroke={c("garlic")}
          strokeWidth="1.5"
          fill="none"
          opacity="0.7"
        />

        <path d="M226 226 C226 208 270 208 270 226 Z" fill="url(#k-onion)" />
        <ellipse cx="248" cy="224" rx="22" ry="7" fill={c("onion-flesh")} />
        {[16, 11, 6].map((rx) => (
          <ellipse
            key={rx}
            cx="248"
            cy="224"
            rx={rx}
            ry={rx * 0.32}
            fill="none"
            stroke={c("onion-light")}
            strokeWidth="1.1"
            opacity="0.8"
          />
        ))}

        {[
          [288, 224, 5, 3],
          [298, 226, 4, 2.6],
          [306, 223, 4.5, 2.8],
          [293, 221, 3.5, 2.2],
          [314, 226, 3.5, 2.2],
        ].map(([x, y, rx, ry]) => (
          <g key={`${x}-${y}`}>
            <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={c("onion-flesh")} />
            <path
              d={`M${x - rx} ${y} Q${x} ${y - ry * 1.6} ${x + rx} ${y}`}
              stroke={c("onion")}
              strokeWidth="1"
              fill="none"
            />
          </g>
        ))}

        <path d="M160 230 C170 220 188 218 204 222 C190 224 176 228 166 233 Z" fill="url(#k-chili)" />
        <path d="M204 222 L210 219" stroke={c("chili")} strokeWidth="2" strokeLinecap="round" />
        <path d="M164 234 C176 226 192 226 206 230 C194 231 180 234 170 237 Z" fill="url(#k-chili)" />

        <ellipse cx="372" cy="218" rx="11" ry="10" fill={c("garlic")} />
        <path
          d="M366 210 C364 216 366 223 370 227 M376 209 C379 215 378 222 374 227"
          stroke={c("coat-shade")}
          strokeWidth="1"
          fill="none"
        />
        <path d="M372 208 L373 202" stroke={c("coat-shade")} strokeWidth="1.6" strokeLinecap="round" />

        <path d="M326 231 L392 222 L396 226 L330 233 Z" fill="url(#k-blade)" />
        <rect
          x="394"
          y="220"
          width="36"
          height="8"
          rx="3"
          transform="rotate(-7 394 220)"
          fill={c("jebena")}
        />

        {/* Pot of stew on a gas ring */}
        <ellipse cx="690" cy="250" rx="100" ry="7" fill="url(#k-shadow)" />
        <ellipse cx="700" cy="246" rx="96" ry="12" fill="url(#k-glow)" className="animate-kitchen-glow" />
        <rect x="626" y="243" width="148" height="4" rx="2" fill={c("iron")} />
        <ellipse cx="700" cy="176" rx="80" ry="12" fill="url(#k-steel)" />
        <ellipse cx="700" cy="177" rx="74" ry="10" fill={c("pot-inside")} />

        {/* The stirring forearm, hand and wooden spoon */}
        <g className="animate-kitchen-stir" style={{ transformOrigin: "590px 184px" }}>
          <path d="M652 140 L708 196" stroke={c("wood-dark")} strokeWidth="8" strokeLinecap="round" />
          <path d="M651 139 L705 192" stroke={c("wood-light")} strokeWidth="2.5" strokeLinecap="round" />
          <path
            d="M584 178 C584 168 594 162 604 164 L646 150 C654 148 660 154 658 162 C657 166 654 168 650 170 L608 194 C598 200 584 194 584 184 Z"
            fill="url(#k-sleeve)"
          />
          <path d="M640 150 L650 170" stroke={c("coat-shade")} strokeWidth="2" strokeLinecap="round" />
          <path
            d="M650 156 C650 146 660 140 670 142 C678 144 682 150 681 158 C680 166 674 171 666 171 C658 171 650 166 650 156 Z"
            fill="url(#k-skin)"
          />
          <path
            d="M664 146 C670 148 676 152 679 156 M662 153 C668 155 674 159 677 163 M660 160 C665 162 670 165 673 169"
            stroke={c("skin-dark")}
            strokeWidth="1.2"
            fill="none"
            opacity="0.75"
          />
          <path d="M652 152 C656 145 666 143 672 148 C668 150 662 152 656 156 Z" fill={c("skin-light")} />
          <path
            d="M671 143 C675 144 678 147 680 151"
            stroke={c("skin-light")}
            strokeWidth="1.4"
            fill="none"
            opacity="0.8"
          />
        </g>

        <ellipse cx="700" cy="179" rx="71" ry="8.5" fill="url(#k-stew)" />
        <path
          d="M712 176 C724 174 736 175 746 178"
          stroke={c("oil")}
          strokeWidth="1.6"
          fill="none"
          opacity="0.55"
          strokeLinecap="round"
        />
        <ellipse
          cx="697"
          cy="182"
          rx="11"
          ry="2.8"
          fill="none"
          stroke={c("stew-light")}
          strokeWidth="1.2"
          className="animate-kitchen-ripple"
          style={fromCentre}
        />
        <ellipse
          cx="697"
          cy="182"
          rx="11"
          ry="2.8"
          fill="none"
          stroke={c("stew-light")}
          strokeWidth="1.2"
          className="animate-kitchen-ripple"
          style={{ ...fromCentre, animationDelay: "-0.8s" }}
        />
        {[
          { cx: 726, cy: 180, r: 2.6, delay: "-0.4s" },
          { cx: 742, cy: 182, r: 2, delay: "-1.2s" },
          { cx: 668, cy: 181, r: 2.2, delay: "-1.7s" },
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

        <path
          d="M620 176 C620 205 621 228 626 238 C630 244 640 246 652 246 L748 246 C760 246 770 244 774 238 C779 228 780 205 780 176 A80 12 0 0 1 620 176 Z"
          fill="url(#k-steel)"
        />
        <path
          d="M620 176 C620 205 621 228 626 238 C630 244 640 246 652 246 L748 246 C760 246 770 244 774 238 C779 228 780 205 780 176 A80 12 0 0 1 620 176 Z"
          fill="url(#k-steel-shade)"
        />
        <path
          d="M620 176 A80 12 0 0 0 780 176"
          stroke={c("steel-shine")}
          strokeWidth="1.6"
          fill="none"
          opacity="0.9"
        />
        <path
          d="M735 192 C737 206 737 224 734 238"
          stroke={c("steel-shine")}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M620 190 C606 188 600 196 606 204 C610 208 616 206 621 204"
          stroke={c("steel")}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M780 190 C794 188 800 196 794 204 C790 208 784 206 779 204"
          stroke={c("steel-light")}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        {[640, 660, 680, 700, 720, 740, 760].map((x, index) => (
          <Flame key={x} x={x} delay={`${-(index % 3) * 0.17}s`} />
        ))}

        {/* Injera on a clay mitad, its holes opening as it cooks */}
        <ellipse cx="934" cy="250" rx="118" ry="6" fill="url(#k-shadow)" />
        <path d="M852 236 H1028 V246 Q1028 249 1024 249 H856 Q852 249 852 246 Z" fill={c("clay-dark")} />
        <ellipse
          cx="940"
          cy="238"
          rx="98"
          ry="8"
          fill="url(#k-glow)"
          className="animate-kitchen-glow"
          style={{ animationDelay: "-0.6s" }}
        />
        <ellipse cx="940" cy="231" rx="112" ry="16" fill={c("clay-dark")} />
        <ellipse cx="940" cy="226" rx="112" ry="16" fill="url(#k-clay)" />
        <ellipse cx="940" cy="224" rx="96" ry="12.5" fill="url(#k-injera)" />
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

        {/* Jebena of coffee and small cups on a tray */}
        <ellipse cx="1128" cy="249" rx="62" ry="6" fill="url(#k-shadow)" />
        <ellipse cx="1130" cy="243" rx="58" ry="7" fill={c("wood")} />
        <path
          d="M1086 150 C1062 152 1060 190 1078 202"
          stroke={c("jebena")}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M1118 210 L1142 176 L1147 179 L1126 216 Z" fill="url(#k-jebena)" />
        <circle cx="1104" cy="214" r="26" fill="url(#k-jebena)" />
        <path d="M1094 192 L1098 146 H1110 L1114 192 Z" fill="url(#k-jebena)" />
        <ellipse cx="1104" cy="146" rx="9" ry="3" fill={c("jebena-light")} />
        <path d="M1098 142 C1100 132 1108 132 1110 142" fill={c("straw")} />
        <path
          d="M1112 202 C1116 210 1116 220 1112 228"
          stroke={c("steam")}
          strokeWidth="2.5"
          fill="none"
          opacity="0.25"
          strokeLinecap="round"
        />
        {[1140, 1160, 1180].map((x, index) => (
          <g key={x}>
            <path d={`M${x - 9} 228 C${x - 8} 238 ${x + 8} 238 ${x + 9} 228 Z`} fill={c("porcelain")} />
            <path d={`M${x - 8.6} 231 H${x + 8.6}`} stroke={c("cup-band")} strokeWidth="1.6" />
            <ellipse cx={x} cy="228" rx="9" ry="2.4" fill={index === 0 ? c("coffee") : c("porcelain")} />
          </g>
        ))}

        {/* Steam over everything that is hot */}
        <Steam x={684} y={150} delay="-0.5s" />
        <Steam x={714} y={152} delay="-2s" />
        <Steam x={744} y={150} delay="-3.4s" size={0.9} />
        <Steam x={910} y={206} delay="-1.2s" size={0.8} />
        <Steam x={966} y={206} delay="-3s" size={0.8} />
        <Steam x={1144} y={170} delay="-2.6s" size={0.55} />
        <Steam x={1140} y={220} delay="-0.9s" size={0.45} />
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
