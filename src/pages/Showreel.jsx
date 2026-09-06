// /showreel — Cinematic chapter sequence introducing the AI video
// stack that's actually live on this site. Each chapter is a GSAP
// ScrollTrigger pinned panel: a large model name fades + drifts in,
// a description plate slides in next to it, and the chapter's hero
// thumbnail mounts behind on a parallax curve. Once the user has
// scrolled through the chapter, the trigger releases and the next
// one takes over. Six chapters in total:
//
//   01. LTX-Video       — fast generalist, T2V + I2V
//   02. Hunyuan         — Tencent DiT, T2V + I2V, 720p
//   03. Wan 2.1         — cinematic-motion specialist, 14B I2V
//   04. Mochi           — open-weight T2V
//   05. Flux            — image bridge (T2I, fill, kontext)
//   06. The Pipeline    — ComfyUI + RabbitMQ + worker orchestration
//
// Visual stack: obsidian backdrop + Three.js volumetric backdrop
// (drei <Stars/>), GSAP-driven chapter pins, antd icon glyphs, the
// same amber/rose accent palette as the cinematic hero. Closes with
// a CTA pair pointing at the actual studios.

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ThunderboltOutlined,
  VideoCameraOutlined,
  ApiOutlined,
  ExperimentOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  ArrowRightOutlined,
  RocketOutlined,
} from "@ant-design/icons";

gsap.registerPlugin(ScrollTrigger);

const CHAPTERS = [
  {
    n: "01",
    title: "LTX-Video",
    tagline: "Fast generalist · T2V + I2V",
    body:
      "2 B-parameter text-to-video and image-to-video. The everyday workhorse on the 5090 — fast iteration, clean motion, opens any prompt in seconds. Ships in three weight variants: 0.9, 0.9.5, 0.9.6-distilled.",
    accent: "from-cyan-500/30 via-sky-500/15 to-violet-500/20",
    glow: "shadow-[0_0_120px_-20px_rgba(34,211,238,0.45)]",
    icon: <ThunderboltOutlined />,
    dot: "bg-cyan-300",
  },
  {
    n: "02",
    title: "HunyuanVideo",
    tagline: "Tencent DiT · T2V + I2V · 720p",
    body:
      "The big gun. 13 B parameter DiT for cinematic motion and physical realism. Auto-switched to low-VRAM mode when it hits the queue so a 32 GB card survives the VAE decode.",
    accent: "from-rose-500/30 via-pink-500/15 to-fuchsia-500/20",
    glow: "shadow-[0_0_120px_-20px_rgba(244,63,94,0.45)]",
    icon: <VideoCameraOutlined />,
    dot: "bg-rose-300",
  },
  {
    n: "03",
    title: "Wan 2.1",
    tagline: "Cinematic motion · 14 B I2V",
    body:
      "Stillness to camera move — Wan reads the input frame and invents believable depth + parallax. Wrapper node ComfyUI-WanVideoWrapper handles the 480p I2V path and stitches into the same queue.",
    accent: "from-amber-500/30 via-orange-500/15 to-rose-500/20",
    glow: "shadow-[0_0_120px_-20px_rgba(245,158,11,0.45)]",
    icon: <PlayCircleOutlined />,
    dot: "bg-amber-300",
  },
  {
    n: "04",
    title: "Mochi Preview",
    tagline: "Open-weight T2V",
    body:
      "Mochi-1 preview weights for experimental open-source video generation. Slower than LTX but a useful diversity lane when the planner wants something neither LTX nor Hunyuan would have made.",
    accent: "from-emerald-500/30 via-teal-500/15 to-cyan-500/20",
    glow: "shadow-[0_0_120px_-20px_rgba(16,185,129,0.45)]",
    icon: <ExperimentOutlined />,
    dot: "bg-emerald-300",
  },
  {
    n: "05",
    title: "Flux · the image bridge",
    tagline: "Dev · Schnell · Fill · Kontext",
    body:
      "Every I2V chain starts from an image. Flux Dev does premium T2I, Schnell does fast iteration, Fill inpaints, Kontext does identity-aware edits — the upstream that feeds Wan and Hunyuan I2V.",
    accent: "from-violet-500/30 via-fuchsia-500/15 to-rose-500/20",
    glow: "shadow-[0_0_120px_-20px_rgba(139,92,246,0.45)]",
    icon: <PictureOutlined />,
    dot: "bg-violet-300",
  },
  {
    n: "06",
    title: "The Pipeline",
    tagline: "ComfyUI · RabbitMQ · Oracle BE · Cloudinary",
    body:
      "Submit from the browser → BE pins a job in chat_jobs → RabbitMQ dispatches to the home 5090 → ComfyUI runs the workflow → output lands on Cloudinary → FE polls and the final clip drops into the gallery. End-to-end orchestration, observable per shot, restartable per job.",
    accent: "from-amber-500/30 via-rose-500/20 to-fuchsia-500/25",
    glow: "shadow-[0_0_120px_-20px_rgba(244,63,94,0.45)]",
    icon: <ApiOutlined />,
    dot: "bg-amber-300",
  },
];

export default function Showreel() {
  const navigate = useNavigate();
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const ctx = gsap.context(() => {
      // Each chapter pins for ~1 viewport then releases. Headline +
      // body slide on a curve; numbered glyph counter floats.
      gsap.utils.toArray(".chapter").forEach((panel, idx) => {
        const num   = panel.querySelector(".chapter-n");
        const title = panel.querySelector(".chapter-title");
        const body  = panel.querySelector(".chapter-body");
        const orb   = panel.querySelector(".chapter-orb");

        gsap.fromTo(
          [num, title, body],
          { y: 60, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 1,
            stagger: 0.12,
            ease: "power3.out",
            scrollTrigger: {
              trigger: panel,
              start: "top 75%",
              end:   "top 25%",
              toggleActions: "play none none reverse",
            },
          }
        );

        // Orb drifts across as the chapter scrolls.
        if (orb) {
          gsap.fromTo(
            orb,
            { x: -40, scale: 0.9 },
            {
              x: 40,
              scale: 1.1,
              ease: "none",
              scrollTrigger: {
                trigger: panel,
                start: "top bottom",
                end:   "bottom top",
                scrub: true,
              },
            }
          );
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="relative min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary overflow-hidden">
      {/* Fixed Three.js volumetric backdrop — drifts behind every chapter. */}
      <div className="fixed inset-0 -z-10">
        <Canvas
          camera={{ position: [0, 0, 1], fov: 75 }}
          gl={{ antialias: false, alpha: true }}
        >
          <ambientLight intensity={0.4} />
          <Stars radius={120} depth={60} count={3500} factor={4} fade speed={0.6} />
        </Canvas>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#05050a]/30 via-transparent to-[#05050a]" />
      </div>

      {/* Hero */}
      <section className="relative pt-32 sm:pt-40 pb-24 px-6 sm:px-10 lg:px-16">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
            — The Cinematic Stack · live
          </p>
          <h1 className="mt-4 font-poppins font-black tracking-tight leading-[0.95] text-5xl sm:text-6xl md:text-7xl lg:text-8xl">
            Every model that <br />
            <span className="text-rose-500">makes the cinema</span>.
          </h1>
          <p className="mt-8 max-w-2xl text-base sm:text-lg leading-relaxed text-gray-300">
            Six chapters of the AI video stack actually running on the 5090
            tonight. From a single image to a finished MP4, everything below
            is real production lanes — not a marketing reel.
          </p>
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <button
              onClick={() => navigate("/ai-video")}
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold text-sm transition-all shadow-[0_8px_36px_rgba(244,63,94,0.4)]"
            >
              Open AI Video Studio
              <ArrowRightOutlined className="text-[12px] transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => navigate("/ai-video?tab=cinema")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 bg-white/[0.04] backdrop-blur text-white/90 hover:text-white hover:border-white/40 font-semibold text-sm transition-all"
            >
              Plan a Cinema render
            </button>
          </div>

          <p className="mt-16 text-[10px] font-mono uppercase tracking-[0.28em] text-gray-500 animate-bounce" style={{ animationDuration: "2.6s" }}>
            ↓ scroll to start
          </p>
        </div>
      </section>

      {/* Chapters */}
      {CHAPTERS.map((c) => (
        <section
          key={c.n}
          className="chapter relative min-h-[80vh] px-6 sm:px-10 lg:px-16 py-24 flex items-center"
        >
          {/* Soft accent orb that drifts on scroll. */}
          <div
            aria-hidden
            className={`chapter-orb absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-[80vw] h-[80vw] max-w-[900px] max-h-[900px] rounded-full pointer-events-none bg-gradient-to-br ${c.accent} blur-3xl opacity-40`}
          />

          <div className="relative z-10 max-w-5xl mx-auto w-full">
            <p className="chapter-n text-[10px] font-mono uppercase tracking-[0.32em] text-gray-500 mb-4">
              Chapter {c.n}
            </p>
            <div className="chapter-title flex items-start gap-4 sm:gap-6">
              <div className={`shrink-0 mt-2 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/[0.06] ring-1 ring-white/15 grid place-items-center text-2xl sm:text-3xl text-white ${c.glow}`}>
                {c.icon}
              </div>
              <div>
                <h2 className="font-poppins font-black tracking-tight leading-[1.02] text-4xl sm:text-5xl md:text-6xl text-white [text-shadow:0_2px_30px_rgba(0,0,0,0.55)]">
                  {c.title}
                </h2>
                <p className="mt-2 text-sm sm:text-base text-gray-400 inline-flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
                  {c.tagline}
                </p>
              </div>
            </div>
            <p className="chapter-body mt-8 max-w-2xl text-base sm:text-lg leading-relaxed text-gray-300">
              {c.body}
            </p>
          </div>
        </section>
      ))}

      {/* Closer */}
      <section className="relative px-6 sm:px-10 lg:px-16 py-32">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-amber-300/80">
            — That&apos;s the reel
          </p>
          <h2 className="mt-4 font-poppins font-black tracking-tight leading-[0.95] text-4xl sm:text-5xl md:text-6xl">
            Now go make <span className="text-rose-500">something</span>.
          </h2>
          <p className="mt-6 text-gray-300 text-base leading-relaxed">
            Every model above is a single tab away. Pick a lane and ship.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => navigate("/ai-video")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold text-sm transition-all"
            >
              <RocketOutlined /> Studio
            </button>
            <button
              onClick={() => navigate("/ai-video?tab=cinema")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 bg-white/[0.04] hover:bg-white/[0.08] text-white font-semibold text-sm transition-all"
            >
              Cinema
            </button>
            <button
              onClick={() => navigate("/splat")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 bg-white/[0.04] hover:bg-white/[0.08] text-white font-semibold text-sm transition-all"
            >
              Splat Viewer
            </button>
            <button
              onClick={() => navigate("/room")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 bg-white/[0.04] hover:bg-white/[0.08] text-white font-semibold text-sm transition-all"
            >
              Room Designer
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
