"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChefSceneProps = {
  labels: { scene: string; pause: string; play: string };
};

// One outline weight for the whole drawing.
const line = {
  stroke: "var(--scene-line)",
  strokeWidth: 3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A sleeve: an outline stroke under a slightly narrower coat-coloured one. */
function Sleeve({ d }: { d: string }) {
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke="var(--scene-line)"
        strokeWidth={21}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--scene-coat)"
        strokeWidth={15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** A curl of steam that rises and fades; staggered by a negative delay so a paused scene still shows some. */
function Steam({ x, y, delay }: { x: number; y: number; delay: string }) {
  return (
    <path
      d={`M${x} ${y} c-7 -8 7 -14 0 -22 c-7 -8 7 -14 0 -22`}
      fill="none"
      stroke="var(--scene-steam)"
      strokeWidth={4}
      strokeLinecap="round"
      strokeOpacity={0.75}
      className="animate-scene-steam"
      style={{ animationDelay: delay }}
    />
  );
}

/** A flame under the pot, flickering from its base. */
function Flame({ x, duration, delay }: { x: number; duration: string; delay: string }) {
  return (
    <g
      className="origin-bottom animate-scene-flame [transform-box:fill-box]"
      style={{ animationDuration: duration, animationDelay: delay }}
    >
      <path
        d={`M${x} 199 C${x - 9} 193 ${x - 7} 186 ${x} 179 C${x + 7} 186 ${x + 9} 193 ${x} 199 Z`}
        fill="var(--scene-flame)"
      />
      <path
        d={`M${x} 199 C${x - 5} 196 ${x - 4} 191 ${x} 187 C${x + 4} 191 ${x + 5} 196 ${x} 199 Z`}
        fill="var(--scene-flame-core)"
      />
    </g>
  );
}

const pop: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

// Where injera's holes open, inside its oval.
const EYES = [
  [862, 181],
  [876, 185],
  [884, 177],
  [892, 188],
  [898, 183],
  [906, 177],
  [918, 186],
  [926, 179],
  [938, 184],
  [944, 188],
  [950, 178],
  [958, 186],
  [968, 181],
  [978, 184],
] as const;

const SPICES = [
  { x: 222, color: "var(--scene-berbere)" },
  { x: 266, color: "var(--scene-turmeric)" },
  { x: 310, color: "var(--scene-herb)" },
] as const;

const TOQUE = (
  <>
    <circle cx="523" cy="62" r="14" />
    <circle cx="557" cy="62" r="14" />
    <circle cx="540" cy="53" r="18" />
    <path d="M511 64 L518 82 H562 L569 64 Z" />
  </>
);

/**
 * A small animated kitchen under the homepage header: a chef in a toque stirs
 * a pot of stew over a flame, with injera cooking on a mitad and a jebena of
 * coffee beside it. Drawn in SVG with the scene tokens from globals.css, so it
 * follows the theme; it only moves and fades (CSS keyframes, no library). On
 * narrow screens the sides are cropped and the chef stays in the middle. It
 * pauses off screen and with its button (moving content needs a way to stop
 * it), and stands still for visitors who ask for reduced motion.
 */
export function ChefScene({ labels }: ChefSceneProps) {
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
      className="relative overflow-hidden rounded-3xl border border-border glass data-paused:**:[animation-play-state:paused]"
    >
      <svg
        viewBox="0 0 1200 220"
        preserveAspectRatio="xMidYMax slice"
        role="img"
        aria-label={labels.scene}
        className="block h-[140px] w-full sm:h-[180px] lg:h-[220px]"
      >
        {/* Counter */}
        <rect x="20" y="199" width="1160" height="12" rx="6" fill="var(--scene-counter)" />

        {/* A bowl of red onions */}
        <circle cx="96" cy="176" r="12" fill="var(--scene-onion)" {...line} />
        <circle cx="144" cy="176" r="12" fill="var(--scene-onion)" {...line} />
        <circle cx="120" cy="167" r="13" fill="var(--scene-onion)" {...line} />
        <path d="M120 154 v-6 M95 164 l-2 -5 M145 164 l2 -5" fill="none" {...line} />
        <path d="M72 178 H168 Q166 199 140 199 H100 Q74 199 72 178 Z" fill="var(--scene-jar)" {...line} />

        {/* Spice jars: berbere, turmeric, herbs */}
        {SPICES.map(({ x, color }) => (
          <g key={x}>
            <rect x={x} y="152" width="34" height="46" rx="9" fill="var(--scene-jar)" {...line} />
            <rect x={x + 5} y="170" width="24" height="23" rx="5" fill={color} />
            <rect x={x - 2} y="144" width="38" height="11" rx="4" fill="var(--scene-wood)" {...line} />
          </g>
        ))}

        {/* The chef: coat, scarf and buttons */}
        <path
          d="M494 142 Q494 127 509 126 H571 Q586 127 586 142 L594 199 H486 Z"
          fill="var(--scene-coat)"
          {...line}
        />
        <path d="M527 126 H553 L540 143 Z" fill="var(--scene-scarf)" {...line} />
        {[152, 170, 188].map((y) => (
          <g key={y} fill="var(--scene-line)">
            <circle cx="528" cy={y} r="2.4" />
            <circle cx="552" cy={y} r="2.4" />
          </g>
        ))}
        <Sleeve d="M498 138 L480 172 L504 194" />
        <circle cx="510" cy="195" r="7" fill="var(--scene-skin)" {...line} />

        {/* Head and toque, swaying a little with the stirring */}
        <g className="animate-scene-sway" style={{ transformOrigin: "540px 126px" }}>
          <rect x="533" y="110" width="14" height="18" rx="4" fill="var(--scene-skin)" />
          <circle cx="540" cy="97" r="21" fill="var(--scene-skin)" {...line} />
          {/* One silhouette: an outline layer under a fill layer hides the seams between puffs */}
          <g fill="var(--scene-line)" stroke="var(--scene-line)" strokeWidth={6} strokeLinejoin="round">
            {TOQUE}
          </g>
          <g fill="var(--scene-coat)">{TOQUE}</g>
          <path d="M532 50 Q530 64 532 76 M548 50 Q550 64 548 76" fill="none" {...line} strokeWidth={2} />
          <rect x="515" y="78" width="50" height="11" rx="4" fill="var(--scene-coat)" {...line} />
        </g>

        {/* Pot: the opening, then the stirring arm, then the stew over the spoon */}
        <Sleeve d="M580 138 L606 166" />
        <ellipse cx="700" cy="150" rx="64" ry="10" fill="var(--scene-metal-dark)" {...line} />
        <g className="animate-scene-stir" style={{ transformOrigin: "606px 166px" }}>
          <path d="M640 110 L692 176" stroke="var(--scene-line)" strokeWidth={9} strokeLinecap="round" />
          <path d="M640 110 L692 176" stroke="var(--scene-wood)" strokeWidth={5} strokeLinecap="round" />
          <Sleeve d="M606 166 L650 134" />
          <circle cx="654" cy="131" r="8" fill="var(--scene-skin)" {...line} />
        </g>
        <ellipse cx="700" cy="152" rx="55" ry="6.5" fill="var(--scene-stew)" />
        {[
          { cx: 714, cy: 151, r: 2.8, delay: "-0.3s" },
          { cx: 732, cy: 153, r: 2.2, delay: "-1.1s" },
          { cx: 688, cy: 154, r: 2.4, delay: "-1.8s" },
        ].map(({ cx, cy, r, delay }) => (
          <circle
            key={cx}
            cx={cx}
            cy={cy}
            r={r}
            fill="var(--scene-bubble)"
            className="animate-scene-bubble"
            style={{ ...pop, animationDelay: delay }}
          />
        ))}
        <path
          d="M636 150 L643 180 Q645 190 657 190 H743 Q755 190 757 180 L764 150 A64 10 0 0 1 636 150 Z"
          fill="var(--scene-metal)"
          {...line}
        />
        <rect x="620" y="156" width="18" height="8" rx="4" fill="var(--scene-metal)" {...line} />
        <rect x="762" y="156" width="18" height="8" rx="4" fill="var(--scene-metal)" {...line} />
        <path d="M650 193 H750 M658 193 V199 M742 193 V199" fill="none" {...line} strokeWidth={4} />
        <Flame x={676} duration="0.7s" delay="-0.2s" />
        <Flame x={700} duration="0.9s" delay="-0.5s" />
        <Flame x={724} duration="0.8s" delay="-0.1s" />
        <Steam x={702} y={138} delay="-0.4s" />
        <Steam x={722} y={138} delay="-1.6s" />
        <Steam x={742} y={138} delay="-2.8s" />

        {/* Injera on the mitad, its holes opening as it cooks */}
        <ellipse cx="920" cy="189" rx="102" ry="16" fill="var(--scene-mitad)" {...line} />
        <ellipse cx="920" cy="183" rx="102" ry="16" fill="var(--scene-mitad)" {...line} />
        <ellipse
          cx="920"
          cy="181"
          rx="86"
          ry="12"
          fill="var(--scene-injera)"
          stroke="var(--scene-injera-eye)"
          strokeWidth={2}
        />
        {EYES.map(([cx, cy], index) => (
          <ellipse
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            rx="2.6"
            ry="1.4"
            fill="var(--scene-injera-eye)"
            className="animate-scene-eye"
            style={{ ...pop, animationDelay: `${-((index * 5) % EYES.length) * 0.32}s` }}
          />
        ))}
        <Steam x={900} y={168} delay="-1s" />
        <Steam x={946} y={168} delay="-2.4s" />

        {/* Jebena of coffee */}
        <path d="M1084 128 C1062 130 1060 160 1070 167" fill="none" {...line} strokeWidth={4} />
        <path d="M1108 170 L1128 146 L1132 150 L1112 176 Z" fill="var(--scene-clay)" {...line} />
        <circle cx="1090" cy="175" r="23" fill="var(--scene-clay)" {...line} />
        <path d="M1082 157 L1085 119 H1095 L1098 157 Z" fill="var(--scene-clay)" {...line} />
        <ellipse cx="1090" cy="118" rx="8" ry="3" fill="var(--scene-clay)" {...line} />
        <Steam x={1090} y={110} delay="-2s" />
      </svg>

      <button
        type="button"
        onClick={() => setPlaying((value) => !value)}
        aria-label={playing ? labels.pause : labels.play}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "absolute top-3 right-3 size-9 motion-reduce:hidden",
        )}
      >
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </button>
    </div>
  );
}
