// Full-bleed picture behind the whole app. Home shows it crisp under a light
// scrim; every other page shows it blurred and darker (lighter on Light) so
// the semi-transparent cards stay readable without their own backdrop-filter.
// Only opacity animates; the blur is static on its own layer.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING_SOFT } from "@/lib/motion";
import { useBackground, useHeroArt } from "@/lib/background";

const fill = "absolute inset-0 h-full w-full object-cover";

export function AppBackground({ mode }: { mode: "home" | "page" }) {
  const { url } = useBackground();
  const hero = useHeroArt();
  // keep the last hero picture while it fades out
  const [heroShown, setHeroShown] = useState<string | null>(hero);
  useEffect(() => { if (hero) setHeroShown(hero); }, [hero]);

  const home = mode === "home";

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {/* picture: a crisp and a blurred copy, cross-faded by mode. Keyed by url so
          a new theme picture fades in over the old one (no exit delay). */}
      <AnimatePresence initial={false}>
        <motion.div
          key={url}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, delay: 0.25 } }}
          transition={SPRING_SOFT}
        >
          <motion.img
            src={url}
            alt=""
            draggable={false}
            className={fill}
            initial={false}
            animate={{ opacity: home ? 1 : 0 }}
            transition={SPRING_SOFT}
          />
          <motion.img
            src={url}
            alt=""
            draggable={false}
            className={fill}
            style={{ filter: "blur(var(--bg-blur-page))", willChange: "opacity" }}
            initial={false}
            animate={{ opacity: home ? 0 : 1, scale: 1.08 }}
            transition={SPRING_SOFT}
          />
        </motion.div>
      </AnimatePresence>

      {/* hovered release art (Home, Task 8) */}
      {heroShown && (
        <motion.img
          src={heroShown}
          alt=""
          draggable={false}
          className="absolute -inset-[30px] h-[calc(100%+60px)] w-[calc(100%+60px)] max-w-none object-cover"
          style={{ filter: "blur(18px) saturate(1.2)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: hero ? 0.55 : 0 }}
          transition={SPRING_SOFT}
          onAnimationComplete={() => { if (!hero) setHeroShown(null); }}
        />
      )}

      {/* scrims */}
      <motion.div
        className="absolute inset-0"
        style={{ background: "var(--scrim-home)" }}
        initial={false}
        animate={{ opacity: home ? 1 : 0 }}
        transition={SPRING_SOFT}
      />
      <motion.div
        className="absolute inset-0"
        style={{ background: "var(--scrim-page)" }}
        initial={false}
        animate={{ opacity: home ? 0 : 1 }}
        transition={SPRING_SOFT}
      />
    </div>
  );
}
