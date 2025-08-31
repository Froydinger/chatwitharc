<motion.div
  drag="x"
  dragMomentum
  dragElastic={0.4}
  dragConstraints={railRef}
  onDragStart={() => setIsDragging(true)}
  onDragEnd={handleDragEnd}
  animate={bubbleControls}
  initial={getBubblePosition()}
  whileHover={{ scale: 1.05, transition: { type: "spring", damping: 10, stiffness: 400 } }}
  whileDrag={{
    scale: 1.3,
    zIndex: 1000,
    filter:
      "drop-shadow(0 0 40px hsla(200, 100%, 60%, 0.9)) drop-shadow(0 0 80px hsla(200, 100%, 40%, 0.6))",
    transition: { type: "spring", damping: 5, stiffness: 300 },
  }}
  className="absolute left-0 top-0 -translate-y-2 w-16 h-16 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto"
  style={{
    background:
      "radial-gradient(circle at center, hsla(200, 100%, 80%, 0.2) 0%, hsla(200, 100%, 80%, 0.3) 40%, hsla(200, 100%, 50%, 0.6) 100%)",
    backdropFilter: "blur(20px)",
    border: "2px solid hsla(200, 100%, 70%, 0.7)",
    boxShadow: `
      0 0 40px hsla(200, 100%, 60%, 0.5),
      0 8px 32px hsla(200, 100%, 50%, 0.3),
      inset 0 2px 0 hsla(200, 100%, 90%, 0.6),
      inset 0 -2px 0 hsla(200, 100%, 30%, 0.4)
    `,
  }}
>
  <div className="absolute inset-1 rounded-full overflow-hidden">
    <div className="absolute top-1 left-2 w-6 h-0.5 bg-white opacity-70 blur-sm rounded-full" />
    <div className="absolute bottom-2 right-1 w-4 h-0.5 bg-blue-200 opacity-50 blur-sm rounded-full" />
  </div>
</motion.div>